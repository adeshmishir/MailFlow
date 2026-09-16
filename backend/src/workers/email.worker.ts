import { Worker, type Job } from "bullmq";
import { env } from "../config/env";
import { createRedisConnection, EMAIL_QUEUE_NAME } from "../queues/email.queue";

export function createEmailWorker(): Worker {
  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job: Job) => {
      console.log(`[email-worker] processing job ${job.id}`);
    },
    {
      connection: createRedisConnection(),
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[email-worker] job ${job?.id} failed: ${err.message}`);
  });

  worker.on("error", (err) => {
    console.error(`[email-worker] error: ${err.message}`);
  });

  return worker;
}