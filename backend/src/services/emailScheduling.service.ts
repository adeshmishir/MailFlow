import { z } from "zod";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { emailQueue, EMAIL_QUEUE_NAME } from "../queues/email.queue";

/**
 * emailScheduling.service.ts
 *
 * Phase 3 — scheduling. Owns the "campaign + emails + BullMQ Delayed jobs"
 * shape and NOTHING else. It never imports nodemailer and never sends.
 * Sending is exclusively the worker's + email.service's job (Phase 4).
 *
 * scheduleEmails() runs in ONE Prisma transaction (Campaign + Email rows,
 * status SCHEDULED), then enqueues ONE BullMQ Delayed job per email with
 * jobId = Email.id — BullMQ treats jobId as unique per queue, so a given
 * email can never be double-enqueued and a campaign can never reschedule
 * onto itself.
 */

export const scheduleEmailsSchema = z.object({
  senderId: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  recipients: z.array(z.string().email()).min(1).max(500),
  scheduledAt: z
    .string()
    .datetime({ offset: true })
    .refine((value) => new Date(value).getTime() - Date.now() >= env.MIN_EMAIL_DELAY_MS, {
      message: `scheduledAt must be at least ${env.MIN_EMAIL_DELAY_MS}ms in the future`,
    }),
});

export type ScheduleEmailsInput = z.infer<typeof scheduleEmailsSchema>;

export interface EmailSummary {
  id: string;
  recipient: string;
  scheduledAt: Date;
  sentAt: Date | null;
  status: string;
  error: string | null;
}

export interface ScheduleEmailsResult {
  campaignId: string;
  scheduledCount: number;
  queueName: string;
}

/**
 * Create the Campaign + its Email rows in one transaction (status SCHEDULED),
 * then enqueue one Delayed BullMQ job per email (jobId = Email.id). Returns
 * the campaign, the number of emails that entered the queue, and the queue
 * name.
 */
export async function scheduleEmails(
  userId: string,
  input: ScheduleEmailsInput,
): Promise<ScheduleEmailsResult> {
  const sender = await prisma.sender.findFirst({
    where: { id: input.senderId, userId },
  });
  if (!sender) {
    const err = new Error("Sender not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const scheduledAt = new Date(input.scheduledAt);
  const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());

  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
      data: {
        userId,
        senderId: sender.id,
        subject: input.subject,
        body: input.body,
        startTime: scheduledAt,
        delayBetweenEmails: 0,
        hourlyLimit: env.MAX_EMAILS_PER_HOUR,
      },
    });

    await tx.email.createMany({
      data: input.recipients.map((recipient) => ({
        campaignId: created.id,
        recipient,
        scheduledAt,
      })),
    });

    return created;
  });

  const emails = await prisma.email.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  for (const email of emails) {
    await emailQueue.add(
      "send-email",
      { emailId: email.id },
      {
        jobId: email.id,
        delay: delayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  return {
    campaignId: campaign.id,
    scheduledCount: emails.length,
    queueName: EMAIL_QUEUE_NAME,
  };
}

/**
 * List a user's emails that are not yet SENT, newest first, cursor-paged.
 */
export interface EmailListPage {
  items: EmailSummary[];
  nextCursor: string | null;
}

export async function listScheduledEmails(
  userId: string,
  cursor?: string,
  limit?: number,
): Promise<EmailListPage> {
  const pageSize = Math.min(Math.max(limit ?? 50, 1), 100);
  const emails = await prisma.email.findMany({
    where: { campaign: { userId }, status: { not: "SENT" } },
    orderBy: [{ scheduledAt: "desc" }, { id: "asc" }],
    take: pageSize + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = emails.length > pageSize;
  const page = hasMore ? emails.slice(0, pageSize) : emails;

  return {
    items: page.map((email) => ({
      id: email.id,
      recipient: email.recipient,
      scheduledAt: email.scheduledAt,
      sentAt: email.sentAt,
      status: email.status,
      error: email.error,
    })),
    nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/**
 * List a user's SENT emails, newest first, cursor-paged.
 */
export async function listSentEmails(
  userId: string,
  cursor?: string,
  limit?: number,
): Promise<EmailListPage> {
  const pageSize = Math.min(Math.max(limit ?? 50, 1), 100);
  const emails = await prisma.email.findMany({
    where: { campaign: { userId }, status: "SENT" },
    orderBy: [{ sentAt: "desc" }, { id: "asc" }],
    take: pageSize + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = emails.length > pageSize;
  const page = hasMore ? emails.slice(0, pageSize) : emails;

  return {
    items: page.map((email) => ({
      id: email.id,
      recipient: email.recipient,
      scheduledAt: email.scheduledAt,
      sentAt: email.sentAt,
      status: email.status,
      error: email.error,
    })),
    nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
  };
}
