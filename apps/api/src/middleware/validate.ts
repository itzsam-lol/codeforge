import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";

/** Parses and replaces req.body with the validated value; 400s via ZodError. */
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data as z.infer<T>;
    next();
  };
}
