import type { NextFunction, Request, Response } from "express";
import { z, type ZodTypeAny } from "zod";

/** Parses and replaces req.body with the validated value; 400s via ZodError. */
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data as z.infer<T>;
    next();
  };
}

/**
 * A free-text field that must not contain line breaks — for values that
 * can end up interpolated into a remote .env file (provisioning.ts's
 * envTemplate(), which also sanitizes defensively). A newline would
 * otherwise let the value inject or override a later env line.
 */
export const singleLine = (max: number) => z.string().max(max).regex(/^[^\r\n]*$/, "must not contain line breaks");
