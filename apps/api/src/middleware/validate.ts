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

/** Same as validateBody, for query-string filter/enum params — a clean 400
 *  instead of an unhandled Prisma runtime error on an invalid value. */
export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    req.query = result.data as never;
    next();
  };
}
