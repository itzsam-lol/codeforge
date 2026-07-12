import type { NextFunction, Request, Response } from "express";
import type { Role } from "@codeforge/shared";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/tokens";
import { forbidden, unauthorized } from "../lib/errors";

export interface AuthUser {
  id: string;
  orgId: string;
  role: Role;
  email: string;
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

/** Verifies the Bearer access token and attaches req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized("Missing access token"));
  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    return next(unauthorized("Invalid or expired access token"));
  }
  req.user = {
    id: payload.sub,
    orgId: payload.orgId,
    role: payload.role,
    email: payload.email,
    name: payload.name,
  };
  next();
}

/**
 * Role gate: must run after requireAuth. Resource-level org scoping is
 * enforced in each route by filtering queries on req.user.orgId.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden("Your role does not permit this action"));
    }
    next();
  };
}

/** Recruiters + super admins (content authoring, scoring overrides). */
export const requireStaffWrite = requireRole("super_admin", "recruiter");
/** Everything staff-side that is read-only additionally admits reviewers. */
export const requireStaffRead = requireRole("super_admin", "recruiter", "reviewer");
