import rateLimit from "express-rate-limit";

/** Staff login/refresh: brute-force protection. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Try again later." },
});

/** Candidate identity confirmation: complements the per-link attempt lock. */
export const identityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

/** Global guard on all public endpoints. */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Code execution endpoints (run/submit): protect the Judge0 pool. */
export const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many runs. Wait a few seconds between executions." },
});

/** Support-ticket creation: prevents the support inbox itself from being flooded. */
export const supportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many support requests. Try again shortly, or email us directly." },
});

/** Shared-secret service-to-service routes (HQ reply-sync ingest): a tighter
 *  cap than the global limiter so a leaked secret can't be hammered at
 *  600/min. Mirrors apps/hq-api's ingestLimiter. */
export const serviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
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
});
