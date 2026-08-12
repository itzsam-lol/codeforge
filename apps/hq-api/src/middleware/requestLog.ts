import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

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
        staffId: req.staff?.id,
      },
      "request"
    );
  });
  next();
}
