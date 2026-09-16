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
 * Credentials come exclusively from env. When ETHEREAL_USER/PASSWORD are
 * configured we use them; otherwise we mint a throwaway Ethereal test
 * account at runtime through nodemailer's PUBLIC createTestAccount API
 * (a free test mailbox, no secret involved) so the queue -> worker -> SMTP
 * path can be exercised end to end in development.
 */

type Credentials = { user: string; pass: string } | null;

let credentialPromise: Promise<Credentials> | null = null;

async function resolveCredentials(): Promise<Credentials> {
  if (env.ETHEREAL_USER && env.ETHEREAL_PASSWORD) {
    return { user: env.ETHEREAL_USER, pass: env.ETHEREAL_PASSWORD };
  }
  try {
    const account = await nodemailer.createTestAccount();
    return { user: account.user, pass: account.pass };
  } catch (err) {
    console.error(
      "[email.service] failed to create Ethereal test account:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

let transporterPromise: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporterPromise) return transporterPromise;
  credentialPromise ??= resolveCredentials();
  const creds = await credentialPromise;
  transporterPromise = nodemailer.createTransport({
    host: env.ETHEREAL_HOST || "smtp.ethereal.email",
    port: env.ETHEREAL_PORT || 587,
    secure: false, // Ethereal uses STARTTLS on 587
    auth: creds ? { user: creds.user, pass: creds.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  return transporterPromise;
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
}

export async function sendEmail(params: EmailSendParams): Promise<EmailSendResult> {
  const transporter = await getTransporter();

  const info: SentMessageInfo = await transporter.sendMail({
    from: { name: params.fromName, address: params.fromEmail },
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });

  return {
    messageId: String(info.messageId ?? ""),
    accepted: Array.isArray(info.accepted) ? (info.accepted as string[]) : [],
    rejected: Array.isArray(info.rejected) ? (info.rejected as string[]) : [],
    previewUrl: nodemailer.getTestMessageUrl(info) || null,
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
