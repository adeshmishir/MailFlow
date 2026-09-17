import nodemailer, {
  type SentMessageInfo,
  type Transporter,
} from "nodemailer";
import { env } from "../config/env";

/**
 * email.service.ts
 *
 * THE ONLY module in the backend that talks SMTP. Nothing else imports
 * nodemailer or builds a transporter: routes, scheduler, queues and the
 * worker never call nodemailer directly. The BullMQ worker calls
 * `sendEmail()` and `classifySmtpError()` below; the scheduling route
 * only enqueues delayed BullMQ jobs and never sends.
 *
 * Two delivery modes:
 *
 *  1. DEFAULT — Ethereal (test inbox). Messages are ACCEPTED by Ethereal's
 *     SMTP but are NEVER delivered to a real mailbox (Gmail/Outlook/etc.).
 *     A preview URL is generated so the email can be read on ethereal.email.
 *     When ETHEREAL_USER/PASSWORD are configured they are used; otherwise a
 *     throwaway Ethereal test account is minted at runtime. The frontend and
 *     health endpoint report `mode == "ethereal"` so the UI can label these
 *     as test deliveries instead of claiming real delivery.
 *
 *  2. PRODUCTION SMTP — when SMTP_HOST + SMTP_USER + SMTP_PASSWORD are all
 *     set (Gmail, Outlook, SendGrid, or any provider). Sender identities are
 *     validated against the authenticated account (e.g. Gmail requires the
 *     From address to be the account or a verified alias) and the resulting
 *     messageId/accepted/rejected info is logged and persisted.
 *
 * "Accepted" (nodemailer resolved -> status SENT) is NOT the same as a real
 * inbox delivery: acceptance only means the SMTP server received the message.
 */

export type DeliveryMode = "ethereal" | "smtp";

export interface DeliveryProfile {
  mode: DeliveryMode;
  label: string;
  /** true when the provider generates a preview URL (Ethereal). */
  previewAvailable: boolean;
}

export interface SmtpIdentity {
  mode: DeliveryMode;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  label: string;
  previewAvailable: boolean;
}

function parseSecureFlag(value: string): boolean {
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

export function isProductionSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
}

/**
 * Synchronous, connection-free description of how MailFlow currently
 * delivers email. Exposed via GET /api/health so the UI can show a
 * truthful banner ("test mode" vs. "production SMTP").
 */
export function getDeliveryProfile(): DeliveryProfile {
  if (isProductionSmtpConfigured()) {
    return {
      mode: "smtp",
      label: `SMTP (${env.SMTP_HOST})`,
      previewAvailable: false,
    };
  }
  return {
    mode: "ethereal",
    label: "Ethereal (test inbox)",
    previewAvailable: true,
  };
}

let identityPromise: Promise<SmtpIdentity> | null = null;

async function resolveSmtpIdentity(): Promise<SmtpIdentity> {
  if (isProductionSmtpConfigured()) {
    const user = env.SMTP_USER!;
    const secure = parseSecureFlag(env.SMTP_SECURE);
    return {
      mode: "smtp",
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT,
      secure,
      user,
      pass: env.SMTP_PASSWORD!,
      label: user.includes("@") ? `SMTP ${env.SMTP_HOST} (${user})` : `SMTP ${env.SMTP_HOST}`,
      previewAvailable: false,
    };
  }

  // Ethereal — test-only. No secret involved; the publicly documented
  // createTestAccount API returns a fresh test mailbox.
  if (env.ETHEREAL_USER && env.ETHEREAL_PASSWORD) {
    return {
      mode: "ethereal",
      host: env.ETHEREAL_HOST || "smtp.ethereal.email",
      port: env.ETHEREAL_PORT || 587,
      secure: false,
      user: env.ETHEREAL_USER,
      pass: env.ETHEREAL_PASSWORD,
      label: "Ethereal (test inbox)",
      previewAvailable: true,
    };
  }

  try {
    const account = await nodemailer.createTestAccount();
    return {
      mode: "ethereal",
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      user: account.user,
      pass: account.pass,
      label: "Ethereal (test inbox)",
      previewAvailable: true,
    };
  } catch (err) {
    console.error(
      "[email.service] failed to create Ethereal test account:",
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

export function getSmtpIdentity(): Promise<SmtpIdentity> {
  identityPromise ??= resolveSmtpIdentity();
  return identityPromise;
}

let transporterPromise: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporterPromise) return transporterPromise;
  const identity = await getSmtpIdentity();
  transporterPromise = nodemailer.createTransport({
    host: identity.host,
    port: identity.port,
    secure: identity.secure,
    auth: { user: identity.user, pass: identity.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  return transporterPromise;
}

/**
 * Validate the "From" address against the configured provider. Gmail (and
 * most personal-mail providers) only accept sends where the From address is
 * the authenticated account or a verified send-as alias; anything else is
 * rejected at the SMTP level with a permanent 550/553. Fail early with a
 * clear message instead of a confusing mailbox bounce.
 *
 * - Ethereal: any sender is accepted (test inbox).
 * - SMTP with an email-shaped user: From must match the account, unless
 *   SMTP_ALLOW_ANY_FROM=true (relay providers).
 * - SMTP with an API-key user (e.g. SendGrid "apikey"): no local check; the
 *   provider enforces its own domain verification.
 */
export async function assertSenderAllowedForProvider(fromEmail: string): Promise<void> {
  const identity = await getSmtpIdentity();
  if (identity.mode !== "smtp") {
    return;
  }
  if (env.SMTP_ALLOW_ANY_FROM.trim().toLowerCase() === "true") {
    return;
  }
  const user = identity.user;
  if (!user.includes("@")) {
    return; // API-key style username — provider enforces sender verification.
  }
  if (fromEmail.trim().toLowerCase() !== user.trim().toLowerCase()) {
    const err = new Error(
      `Sender "${fromEmail}" is not authorized for the configured SMTP account "${user}". ` +
        `For Gmail SMTP the From address must be your Gmail address (or a verified send-as alias). ` +
        `Set SMTP_ALLOW_ANY_FROM=true only for relay/API providers that permit arbitrary From addresses.`,
    ) as Error & { code?: number };
    err.code = 553; // permanent — classifySmtpError marks the email FAILED.
    throw err;
  }
}

export interface EmailSendParams {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  previewUrl: string | null;
  providerMode: DeliveryMode;
  providerLabel: string;
}

export async function sendEmail(params: EmailSendParams): Promise<EmailSendResult> {
  const transporter = await getTransporter();
  const identity = await getSmtpIdentity();

  await assertSenderAllowedForProvider(params.fromEmail);

  let info: SentMessageInfo;
  try {
    info = await transporter.sendMail({
      from: { name: params.fromName, address: params.fromEmail },
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
  } catch (err) {
    console.warn(
      `[email.service] SMTP rejected message from=${params.fromEmail} to=${params.to} ` +
        `error=${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }

  const messageId = String(info.messageId ?? "");
  const accepted = Array.isArray(info.accepted) ? (info.accepted as string[]) : [];
  const rejected = Array.isArray(info.rejected) ? (info.rejected as string[]) : [];
  const previewUrl: string | null = identity.previewAvailable
    ? nodemailer.getTestMessageUrl(info) || null
    : null;

  // Essential delivery facts only. No credentials are ever logged. The
  // preview URL is only set for Ethereal (test inboxes, no secrets exposed).
  console.log(
    `[email.service] ${identity.mode === "ethereal" ? "test" : "accepted"}: ` +
      `messageId=${messageId || "(none)"} provider="${identity.label}" ` +
      `from=${params.fromEmail} to=${params.to} accepted=${accepted.length} rejected=${rejected.length}` +
      (previewUrl ? ` preview=${previewUrl}` : ""),
  );

  return {
    messageId,
    accepted,
    rejected,
    previewUrl,
    providerMode: identity.mode,
    providerLabel: identity.label,
  };
}

export type SmtpErrorKind = "permanent" | "transient" | "unknown";

/**
 * Decide whether a thrown SMTP error should be retried:
 *  - permanent -> retrying is pointless (bad recipient, rejected sender,
 *    auth failure). Worker marks the Email FAILED.
 *  - transient -> worth a delayed retry (4xx, connection refused/timeout,
 *    socket errors). Worker lets BullMQ backoff retry.
 *  - unknown   -> treat like transient; safer than silently dropping.
 */
export function classifySmtpError(err: unknown): SmtpErrorKind {
  if (!(err instanceof Error)) return "unknown";

  const smtpCode = (err as { code?: unknown }).code;
  if (typeof smtpCode === "number") {
    if (smtpCode >= 500) return "permanent";
    if (smtpCode >= 400) return "transient";
    return "unknown";
  }

  const msg = err.message.toLowerCase();

  // Explicit recipient / sender rejection (5.x.x permanent).
  if (
    (msg.includes("550") ||
      msg.includes("553") ||
      msg.includes("5.5.1") ||
      msg.includes("5.1.1")) &&
    (msg.includes("rejected") ||
      msg.includes("not exist") ||
      msg.includes("invalid address") ||
      msg.includes("user unknown"))
  ) {
    return "permanent";
  }

  // Transient / connection-level failures worth a retry with backoff.
  if (
    msg.includes("etimedout") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("greeting never received") ||
    msg.includes("connection closed before greeting") ||
    msg.includes("421") ||
    msg.includes("451") ||
    msg.includes("450")
  ) {
    return "transient";
  }

  return "unknown";
}