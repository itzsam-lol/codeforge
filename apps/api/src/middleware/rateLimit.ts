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
