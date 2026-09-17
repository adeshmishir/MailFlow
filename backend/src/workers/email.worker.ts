import { Worker, type Job } from "bullmq";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { EMAIL_QUEUE_NAME, createRedisConnection } from "../queues/email.queue";
import {
  classifySmtpError,
  sendEmail,
  type EmailSendParams,
} from "../services/email.service";
import { indexEmail } from "../services/search.service";
import { sendRateLimitSlackAlert } from "../services/slack.service";
import { acquireSendSlot } from "../services/rateLimit.service";

interface SendEmailData {
  emailId: string;
}

/**
 * email.worker.ts
 *
 * BullMQ Worker for the "email-send" queue.
 * Integrates:
 *   - Atomic Redis rate-limiting and min-delay gating
 *   - Slack alert notifications on rate limit hit
 *   - Automatic Elasticsearch indexing on SENT / FAILED status
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

  if (!email) {
    return; // email deleted
  }

  // Already finished — never send twice (also covers BullMQ reprocessing a job
  // whose email legitimately completed).
  if (email.status === "SENT" || email.status === "FAILED") {
    return;
  }

  // 1. Check rate limit and min-delay gate
  const redis = createRedisConnection();
  try {
    const slot = await acquireSendSlot(redis, email.campaign.senderId);
    if (!slot.allowed) {
      // If hourly rate limit reached, send Slack alert (deduplicated by Redis)
      if (slot.retryAfterMs > env.MIN_EMAIL_DELAY_MS) {
        await sendRateLimitSlackAlert(email.campaign.userId, email.campaign.sender.email);
      }

      // Delay job without failing it
      if (job.token) {
        await job.moveToDelayed(Date.now() + slot.retryAfterMs, job.token);
      } else {
        throw new Error(
          `Rate limit or gate active for sender ${email.campaign.senderId}. Retry after ${slot.retryAfterMs}ms`,
        );
      }
      return;
    }
  } finally {
    redis.disconnect();
  }

  // 2. Claim email status SCHEDULED -> PROCESSING. An email already in
  //    PROCESSING means a previous worker crashed mid-send (BullMQ re-delivered
  //    the stalled job), so resume the send instead of abandoning it.
  if (email.status === "SCHEDULED") {
    const claimed = await prisma.email.updateMany({
      where: { id: emailId, status: "SCHEDULED" },
      data: { status: "PROCESSING" },
    });
    if (claimed.count === 0) {
      return; // lost claim to concurrent worker
    }
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
      data: {
        status: "SENT",
        sentAt: new Date(),
        deliveryProvider: info.providerMode,
        deliveryMessageId: info.messageId,
        deliveryPreviewUrl: info.previewUrl,
      },
    });

    // 3. Update search index in Elasticsearch (non-blocking)
    indexEmail(emailId).catch((err) =>
      console.warn(`[worker] Failed to index sent email ${emailId}:`, err),
    );

    if (info.previewUrl) {
      console.log(`[worker] ${job.id} preview: ${info.previewUrl}`);
    }
  } catch (err) {
    const isPermanent = classifySmtpError(err) === "permanent";
    const maxAttempts = job.opts.attempts ?? 3;
    const finalAttempt = job.attemptsMade >= maxAttempts - 1;

    if (isPermanent || finalAttempt) {
      console.error(
        `[worker] email ${emailId} ${isPermanent ? "permanently rejected" : "failed after retries"}: ` +
          `from=${email.campaign.sender.email} to=${email.recipient} ` +
          `error=${err instanceof Error ? err.message : String(err)}`,
      );

      await prisma.email.updateMany({
        where: { id: emailId, status: "PROCESSING" },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        },
      });

      // Update search index in Elasticsearch (non-blocking)
      indexEmail(emailId).catch((indexingErr) =>
        console.warn(`[worker] Failed to index failed email ${emailId}:`, indexingErr),
      );

      return; // permanent or exhausted: do NOT rethrow
    }

    // Revert status to SCHEDULED for retry
    await prisma.email.updateMany({
      where: { id: emailId, status: "PROCESSING" },
      data: { status: "SCHEDULED" },
    });

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