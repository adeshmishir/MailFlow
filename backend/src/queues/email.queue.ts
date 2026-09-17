import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getRedisUrl } from "../config/redis";

export const EMAIL_QUEUE_NAME = "email-send";

export function createRedisConnection(): IORedis {
  return new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    // BullMQ needs a named connection to share timeouts cleanly.
    connectionName: "mailflow",
  });
}

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: createRedisConnection(),
});