import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

/**
 * Structured per-request log (spec 8 observability): method, path, status,
 * duration, and the authenticated user if any, so a failed candidate
 * submission or a slow grading dispatch is debuggable after the fact.
 */
export function requestLog(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    logger.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        userId: req.user?.id,
        orgId: req.user?.orgId,
      },
      "request"
    );
  });
  next();
}
