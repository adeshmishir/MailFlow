import type { Redis } from "ioredis";
import { env } from "../config/env";

/**
 * Distributed, Redis-backed email rate limiting + minimum-delay gating.
 *
 * Rules (Phase 4):
 *   - MAX_EMAILS_PER_HOUR  → an atomic hourly counter keyed by sender, so
 *     multiple worker processes share the SAME limit (never a process-local
 *     counter). When the budget is exhausted the caller must REQUEUE/DELAY
 *     the BullMQ job — never fail it.
 *   - MIN_EMAIL_DELAY_MS   → an actor key (acquire-once-with-TTL) that spaces
 *     sends per sender, shared across workers, so worker concurrency can never
 *     fire N emails simultaneously.
 *
 * Both keys are scoped by senderId so separate senders do not contend.
 * "Atomic" here means a single multi/incr+expire round trip so two workers
 * cannot both bump an expired budget and oversend.
 */

const RATE_KEY = (senderId: string, hourKey: string) =>
  `mailflow:rate:${senderId}:${hourKey}`;
const GATE_KEY = (senderId: string) => `mailflow:gate:${senderId}`;

export function hourlyWindowKey(now: Date = new Date()): string {
  return String(Math.floor(now.getTime() / 3_600_000));
}

export interface RateDecision {
  allowed: boolean;
  /** Set when a gate or budget rejected; the caller should requeue + delay. */
  retryAfterMs: number;
}

/**
 * Atomically register one candidate send for a sender and decide whether a
 * send may begin right now. safeScript:
 *
 *   EVAL "
 *     local budget = redis.call('INCR', KEYS[1])
 *     if budget == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
 *     if budget > tonumber(ARGV[2]) then
 *       -- refund the (possibly new) increment since we will not consume it
 *       redis.call('DECR', KEYS[1])
 *       return 'limit'
 *     end
 *     if redis.call('SET', KEYS[2], '1', 'PX', ARGV[3], 'NX') == false then
 *       redis.call('DECR', KEYS[1])
 *       return 'gate'
 *     end
 *     return 'ok'
 *   " 2 <rateKey> <gateKey> <ttlMs> <maxPerHour> <gateTtlMs>
 *
 * The Lua script makes INCR + EXPIRE + SET NX an atomic decision shared by
 * every worker process (distributed, not in-memory).
 */
export async function acquireSendSlot(
  redis: Redis,
  senderId: string,
): Promise<RateDecision> {
  const now = new Date();
  const hourKey = hourlyWindowKey(now);
  const rateKey = RATE_KEY(senderId, hourKey);
  const gateKey = GATE_KEY(senderId);

  const ttlMs = 3_600_000; // 1 hour so the counter expires on its own
  const gateTtlMs = Math.max(0, env.MIN_EMAIL_DELAY_MS);

  const slotScript = `
    local budget = redis.call('INCR', KEYS[1])
    if budget == 1 then redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1])) end
    if budget > tonumber(ARGV[2]) then
      redis.call('DECR', KEYS[1])
      return 'limit'
    end
    if redis.call('SET', KEYS[2], '1', 'PX', tonumber(ARGV[3]), 'NX') == false then
      redis.call('DECR', KEYS[1])
      return 'gate'
    end
    return 'ok'
  `;

  const result: string = (await redis.eval(
    slotScript,
    2,
    rateKey,
    gateKey,
    String(ttlMs),
    String(env.MAX_EMAILS_PER_HOUR),
    String(gateTtlMs),
  )) as string;

  if (result === "ok") {
    return { allowed: true, retryAfterMs: 0 };
  }
  if (result === "limit") {
    // Budget exhausted until the next hour window flips.
    const nextHour = (Math.floor(now.getTime() / 3_600_000) + 1) * 3_600_000;
    return { allowed: false, retryAfterMs: Math.max(1, nextHour - now.getTime()) };
  }
  // gate — minimum delay not yet elapsed for this sender
  return { allowed: false, retryAfterMs: Math.max(1, gateTtlMs) };
}
