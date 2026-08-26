import crypto from "node:crypto";
import Redis from "ioredis";
import { config } from "../config";

/**
 * Short-lived store for the OAuth redirect hand-off: after a provider
 * callback finishes the code exchange server-side, we never put the real
 * JWT in a URL (browser history/referrer-leakable) — instead we mint a
 * one-time opaque code, stash the resolved userId behind it for 60s, and
 * redirect the browser to apps/marketing with just that code. Marketing
 * immediately exchanges it for the real token pair via POST
 * /api/arena/auth/oauth/exchange.
 *
 * Dedicated Redis connection, same instantiation pattern as
 * middleware/rateLimit.ts's redisClient — this module has nothing to do
 * with rate limiting, so it gets its own rather than reaching into that
 * file's private client.
 */
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

const PREFIX = "arena:oauth-exchange:";
const TTL_SECONDS = 60;

export async function createOAuthExchangeCode(userId: string): Promise<string> {
  const code = crypto.randomBytes(24).toString("hex");
  await redis.set(PREFIX + code, userId, "EX", TTL_SECONDS);
  return code;
}

/** Single-use: consumes and deletes the code, returns the userId or null if
 *  unknown/expired/already used. */
export async function consumeOAuthExchangeCode(code: string): Promise<string | null> {
  const key = PREFIX + code;
  const [[, userId], [, deleted]] = (await redis
    .multi()
    .get(key)
    .del(key)
    .exec()) as [[Error | null, string | null], [Error | null, number]];
  if (!deleted || !userId) return null;
  return userId;
}

const STATE_PREFIX = "arena:oauth-state:";
const STATE_TTL_SECONDS = 5 * 60;

/** CSRF state for the /start -> /callback round trip, keyed server-side
 *  (Redis) rather than an httpOnly cookie so it survives a callback that
 *  lands on a different app-server instance than /start did. */
export async function createOAuthState(): Promise<string> {
  const state = crypto.randomBytes(16).toString("hex");
  await redis.set(STATE_PREFIX + state, "1", "EX", STATE_TTL_SECONDS);
  return state;
}

export async function consumeOAuthState(state: string): Promise<boolean> {
  const deleted = await redis.del(STATE_PREFIX + state);
  return deleted === 1;
}
