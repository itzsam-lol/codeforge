import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "./logger";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
  }
}

export const notFound = (msg = "Not found") => new AppError(404, msg);
export const badRequest = (msg: string) => new AppError(400, msg);
export const unauthorized = (msg = "Unauthorized") => new AppError(401, msg);
export const forbidden = (msg = "Forbidden") => new AppError(403, msg);
export const conflict = (msg: string) => new AppError(409, msg);
export const serviceUnavailable = (msg: string) => new AppError(503, msg);

/** Wrap async route handlers so rejections reach the error middleware. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as T, res, next).catch(next);
  };
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  logger.error({ err, path: req.path }, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
