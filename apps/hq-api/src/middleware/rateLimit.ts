import rateLimit from "express-rate-limit";

/** Staff login/refresh: brute-force protection. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Try again later." },
});

/** Marketing site's lead-ingest endpoint: protects against a leaked secret being hammered. */
export const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Shared-secret service-to-service routes (billing summary fetch): same
 *  posture as ingestLimiter — a tighter cap than the global limiter so a
 *  leaked secret can't be hammered at 600/min. */
export const serviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Global guard on all endpoints. */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
