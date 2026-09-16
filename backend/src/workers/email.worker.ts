import { Worker, type Job } from "bullmq";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { EMAIL_QUEUE_NAME, createRedisConnection } from "../queues/email.queue";
import {
  classifySmtpError,
  sendEmail,
  type EmailSendParams,
} from "../services/email.service";

interface SendEmailData {
  emailId: string;
}

/**
 * email.worker.ts
 *
 * BullMQ Worker for the "email-send" queue. One job == one Email row;
 * jobId == Email.id. It is the ONLY consumer that calls sendEmail()
 * (the SMTP module) and never builds a transporter itself.
 *
 * Idempotency is done two ways:
 *   1. BullMQ jobId uniqueness (jobId = Email.id) means a double enqueue is
 *      impossible at the queue layer.
 *   2. The worker claims an email with an atomic status transition
 *      SCHEDULED -> PROCESSING before sending, so a concurrent worker cannot
 *      double-send.
 *
 * Retry policy (BullMQ-native):
 *   - transient SMTP errors (4xx, connection refused/timeout) -> rethrow;
 *     BullMQ retries with exponential backoff (attempts=3 set at enqueue).
 *   - permanent SMTP errors (5xx, recipient rejected) -> mark the Email
 *     FAILED, never retry.
 *   - exhausted attempts -> mark FAILED with the last error.
 */
async function runSend(job: Job, emailId: string): Promise<void> {
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: {
      campaign: {
        include: {
          sender: true,
        },
      },
    },
  });

  if (!email || email.status !== "SCHEDULED") {
    return; // stale / already claimed by another worker
  }

  const claimed = await prisma.email.updateMany({
    where: { id: emailId, status: "SCHEDULED" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) {
    return; // lost the claim to a concurrent worker
  }

  try {
    const params: EmailSendParams = {
      fromName: email.campaign.sender.name,
      fromEmail: email.campaign.sender.email,
      to: email.recipient,
      subject: email.campaign.subject,
      text: email.campaign.body,
    };

    const info = await sendEmail(params);

    await prisma.email.updateMany({
      where: { id: emailId, status: "PROCESSING" },
      data: { status: "SENT", sentAt: new Date() },
    });

    if (info.previewUrl) {
      console.log(`[worker] ${job.id} preview: ${info.previewUrl}`);
    }
  } catch (err) {
    const isPermanent = classifySmtpError(err) === "permanent";
    const maxAttempts = job.opts.attempts ?? 3;
    const finalAttempt = job.attemptsMade >= maxAttempts - 1;

    if (isPermanent || finalAttempt) {
      await prisma.email.updateMany({
        where: { id: emailId, status: "PROCESSING" },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        },
      });
      return; // permanent or exhausted: do NOT rethrow
    }

    throw err; // transient: let BullMQ backoff retry
  }
}

export function createEmailWorker(): Worker {
  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job) => {
      const data = job.data as SendEmailData;
      if (!data?.emailId) {
        return;
      }
      await runSend(job, data.emailId);
    },
    {
      connection: createRedisConnection(),
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} failed: ${err.message}`);
  });

  worker.on("error", (err) => {
    console.error("[worker] worker error:", err instanceof Error ? err.message : err);
  });

  return worker;
}