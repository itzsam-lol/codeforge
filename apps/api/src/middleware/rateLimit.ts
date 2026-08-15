import rateLimit from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import Redis from "ioredis";
import { config } from "../config";

// Dedicated connection: BullMQ's `redisConnection` (jobs/queues.ts) is a
// plain ConnectionOptions object handed to BullMQ so it can manage its own
// pool, not a usable ioredis client. Rate limiting needs an actual client so
// every API process shares the same counters — without this, each
// horizontally-scaled instance enforced its own in-memory limit, so a client
// could get N requests through per instance instead of N total.
const redisClient = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

function redisStore(prefix: string) {
  return new RedisStore({
    prefix,
    sendCommand: (...args: [string, ...string[]]) =>
      redisClient.call(...args) as Promise<RedisReply>,
  });
}

/** Staff login/refresh: brute-force protection. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Try again later." },
  store: redisStore("rl:auth:"),
});

/** Candidate identity confirmation: complements the per-link attempt lock. */
export const identityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
  store: redisStore("rl:identity:"),
});

/** Global guard on all public endpoints. */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:global:"),
});

/** Code execution endpoints (run/submit): protect the Judge0 pool. */
export const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many runs. Wait a few seconds between executions." },
  store: redisStore("rl:execution:"),
});

/** Support-ticket creation: prevents the support inbox itself from being flooded. */
export const supportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many support requests. Try again shortly, or email us directly." },
  store: redisStore("rl:support:"),
});

/** Shared-secret service-to-service routes (HQ reply-sync ingest): a tighter
 *  cap than the global limiter so a leaked secret can't be hammered at
 *  600/min. Mirrors apps/hq-api's ingestLimiter. */
export const serviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:service:"),
});

/** Candidate webcam/identity snapshot uploads: each request can carry a
 *  decoded image up to ~1.5MB, so this caps sustained upload volume from a
 *  single session beyond what validateBody's size check alone prevents. */
export const snapshotLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many snapshots. Slow down." },
  store: redisStore("rl:snapshot:"),
});

/** CodeForge Sentinel heartbeat: legitimate cadence is one every 15s (4/min).
 *  12/min leaves slack for retries/clock drift while still capping well
 *  below the global limiter — without this, nothing stopped a client from
 *  hammering the endpoint far faster than intended and writing unbounded
 *  ProctoringEvent rows per request. */
export const sentinelHeartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many heartbeats. Slow down." },
  store: redisStore("rl:sentinel-heartbeat:"),
});
