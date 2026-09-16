import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env";

export const EMAIL_QUEUE_NAME = "email-send";

export function createRedisConnection(): IORedis {
  return new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    maxRetriesPerRequest: null,
  });
}

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: createRedisConnection(),
});