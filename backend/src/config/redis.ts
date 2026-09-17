import { env } from "./env";

/**
 * Redis connection resolution shared by express-session (node-redis) and
 * BullMQ (ioredis) so both always point at the SAME Redis instance.
 *
 * Precedence:
 *   1. REDIS_URL  — full connection string for managed providers
 *      (e.g. Render Key Value, Upstash, Redis Cloud). Supports `redis://` and
 *      `rediss://` (TLS). Includes credentials/TLS automatically.
 *   2. REDIS_HOST + REDIS_PORT (+ REDIS_PASSWORD when set).
 */
export function getRedisUrl(): string {
  if (env.REDIS_URL) {
    return env.REDIS_URL;
  }
  const creds = env.REDIS_PASSWORD
    ? `:${encodeURIComponent(env.REDIS_PASSWORD)}@`
    : "";
  return `redis://${creds}${env.REDIS_HOST}:${env.REDIS_PORT}`;
}

/** True when the resolved Redis connection uses TLS (rediss://). */
export function isRedisTls(): boolean {
  return getRedisUrl().startsWith("rediss://");
}