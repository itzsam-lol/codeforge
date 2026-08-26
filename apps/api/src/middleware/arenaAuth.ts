import type { NextFunction, Request, Response } from "express";
import { verifyArenaAccessToken, type ArenaAccessTokenPayload } from "../lib/tokens";
import { unauthorized } from "../lib/errors";

export interface ArenaAuthUser {
  id: string;
  email: string;
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    // Kept separate from req.user (staff) and req.candidate (candidate
    // invitation tokens) so the three auth contexts stay unambiguous at the
    // type level — a route can never accidentally read the wrong identity.
    arenaUser?: ArenaAuthUser;
  }
}

/** Verifies the Bearer access token and attaches req.arenaUser. Mirrors
 *  requireAuth (middleware/auth.ts) exactly, against the separate Arena
 *  JWT secret. */
export function requireArenaAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized("Missing access token"));
  let payload: ArenaAccessTokenPayload;
  try {
    payload = verifyArenaAccessToken(header.slice("Bearer ".length));
  } catch {
    return next(unauthorized("Invalid or expired access token"));
  }
  req.arenaUser = { id: payload.sub, email: payload.email, name: payload.name };
  next();
}

/** Same verification, but never rejects — attaches req.arenaUser if a valid
 *  token is present, otherwise leaves it undefined. Used by routes that are
 *  public but personalize when a session exists (e.g. contest detail
 *  showing "you're registered"). */
export function optionalArenaAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  try {
    const payload = verifyArenaAccessToken(header.slice("Bearer ".length));
    req.arenaUser = { id: payload.sub, email: payload.email, name: payload.name };
  } catch {
    // Invalid/expired token on an optional-auth route: proceed unauthenticated.
  }
  next();
}
