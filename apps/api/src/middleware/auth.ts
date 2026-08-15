import type { NextFunction, Request, Response } from "express";
import type { Permission, Role } from "@codeforge/shared";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/tokens";
import { forbidden, unauthorized } from "../lib/errors";

export interface AuthUser {
  id: string;
  orgId: string;
  role: Role;
  permissions: Permission[];
  permissionsExplicit: boolean;
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
    permissions: payload.permissions ?? [],
    permissionsExplicit: payload.permissionsExplicit ?? false,
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

/**
 * Fine-grained capability gate, additive to (not a replacement for) the role
 * checks above: apply both on a route, e.g.
 * `questionRouter.use(requireAuth, requireStaffWrite)` at the router level
 * plus `requirePermission("questions")` per-route for the finer cut.
 *
 * Must run after requireAuth. super_admin always passes. Every account that
 * existed before the permissions feature launched has `permissionsExplicit:
 * false` and an implicit empty `permissions` array — that combination still
 * passes everything within the user's role tier, so nothing already granted
 * access loses it. Once an account has `permissionsExplicit: true` (every
 * account created since, or any legacy account an admin has since edited —
 * see user.routes.ts), its `permissions` array is an explicit allow-list:
 * empty means no permissions at all, not unrestricted. This is what closes
 * the "revoke everything to grant everything" escalation an empty array
 * used to cause unconditionally.
 */
export function requirePermission(...keys: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === "super_admin") return next();
    if (!req.user.permissionsExplicit && req.user.permissions.length === 0) return next();
    if (keys.some((k) => req.user!.permissions.includes(k))) return next();
    return next(forbidden("Your account does not have this permission"));
  };
}
