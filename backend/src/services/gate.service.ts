import { prisma } from "../config/database";
import { emailQueue } from "../queues/email.queue";
import { env } from "../config/env";

/**
 * gate.service.ts — distributed "may I send now?" decisions.
 *
 * Two independent Redis-backed guards per sender:
 *   1. min-delay gate: a sender may only fire one email every
 *      MIN_EMAIL_DELAY_MS. Implemented with a SET NX PX lease (SET with
 *      NX + PX succeeds only if the key is absent). Two BullMQ workers
 *      for the same sender therefore can't both pass this guard.
 *   2. hourly cap: at most MAX_EMAILS_PER_HOUR sends per sender per
 *      rolling hour. Implemented with INCR + EXPIRE on a per-hour key.
 *
 * A job that fails either guard is NOT dropped and NOT hard-failed —
 * the worker re-enqueues it as a Delayed job (jobId = email.id, so BullMQ
 * dedupes) with the remaining wait, preserving the exact BullMQ semantics
 * (delay via BullMQ job delay, attempts/backoff from the job options).
 *
 * Redis connection is created here the same way the queue/worker do
 * (maxRetriesPerRequest: null, BullMQ-compatible), so this module needs no
 * external npm package beyond ioredis — the only "distributed lock" here is
 * Redis's own atomic prefix ops.
 */

import IORedis from "ioredis";
import { createRedisConnection } from "../queues/email.queue";

export interface GateDecision {
  allowed: boolean;
  waitMs: number;
}

const MIN_GATE_TTL_MS = env.MIN_EMAIL_DELAY_MS;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Ask Redis whether a sender may fire an email right now.
 * - allowed=true  -> proceed (lease acquired, hourly budget remains).
 * - allowed=false -> waitMs is how long until the sender is un-gated; the
 *   caller re-enqueues as a Delayed job with delay=waitMs.
 */
export async function checkSendGate(senderId: string): Promise<GateDecision> {
  const redis = createRedisConnection();
  try {
    const now = Date.now();

    // 1. Min-delay lease: only acquires if no lease currently set.
    const gateKey = `mail:gate:${senderId}`;
    const gate = await redis.set(gateKey, String(now), "PX", MIN_GATE_TTL_MS, "NX");
    if (gate !== "OK") {
      const ttl = await redis.pttl(gateKey);
      return { allowed: false, waitMs: Math.max(0, ttl) };
    }

    // 2. Hourly budget.
    const hourKey = `mail:hour:${senderId}:${Math.floor(now / HOUR_MS)}`;
    const count = await redis.incr(hourKey);
    if (count === 1) {
      await redis.expire(hourKey, 3600);
    }
    if (count > env.MAX_EMAILS_PER_HOUR) {
      const nextHour = (Math.floor(now / HOUR_MS) + 1) * HOUR_MS;
      // Voluntarily release our own lease so the next (valid) email isn't
      // blocked on the lease we just acquired pointlessly.
      await redis.del(gateKey);
      return { allowed: false, waitMs: Math.max(0, nextHour - now) };
    }

    return { allowed: true, waitMs: 0 };
  } finally {
    redis.disconnect();
  }
}
