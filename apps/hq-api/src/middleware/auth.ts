import type { NextFunction, Request, Response } from "express";
import type { HqPermission } from "../lib/permissions";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/tokens";
import { forbidden, unauthorized } from "../lib/errors";

export interface AuthStaff {
  id: string;
  role: "owner" | "staff";
  permissions: HqPermission[];
  email: string;
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    staff?: AuthStaff;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized("Missing access token"));
  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    return next(unauthorized("Invalid or expired access token"));
  }
  req.staff = {
    id: payload.sub,
    role: payload.role,
    permissions: payload.permissions ?? [],
    email: payload.email,
    name: payload.name,
  };
  next();
}

/** Owner-only actions (HQ team management, e.g.). */
export function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if (!req.staff) return next(unauthorized());
  if (req.staff.role !== "owner") return next(forbidden("Only an HQ owner can do this"));
  next();
}

/**
 * Fine-grained capability gate, same additive design as the client
 * product's requirePermission (apps/api/src/middleware/auth.ts): owner
 * always passes; an empty permissions array passes everything; a non-empty
 * array is an explicit allow-list.
 */
export function requirePermission(...keys: HqPermission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.staff) return next(unauthorized());
    if (req.staff.role === "owner") return next();
    if (req.staff.permissions.length === 0) return next();
    if (keys.some((k) => req.staff!.permissions.includes(k))) return next();
    return next(forbidden("Your account does not have this permission"));
  };
}
