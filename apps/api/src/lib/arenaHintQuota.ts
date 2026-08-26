import Redis from "ioredis";
import { config } from "../config";

/**
 * Daily per-user cap on AI practice hints (services/aiHint.ts) — a real
 * GCP-spend guard, not just abuse protection. Dedicated Redis connection,
 * same instantiation pattern as lib/arenaOAuthState.ts.
 */
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

const DAILY_LIMIT = 5;

function todayKey(userId: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
  return `arena:hint-quota:${userId}:${today}`;
}

/** Increments and returns whether this request is still within quota.
 *  TTL set to 2 days so a stale key can never linger indefinitely, while
 *  comfortably outliving the UTC day it's scoped to. */
export async function consumeHintQuota(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = todayKey(userId);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 2 * 24 * 60 * 60);
  return { allowed: count <= DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count) };
}

export { DAILY_LIMIT as HINT_DAILY_LIMIT };
