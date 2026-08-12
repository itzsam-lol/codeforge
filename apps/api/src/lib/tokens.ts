import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Permission, Role } from "@codeforge/shared";
import { config } from "../config";

export interface AccessTokenPayload {
  sub: string;
  orgId: string;
  role: Role;
  // Optional so tokens issued before this field existed still verify cleanly
  // (requireAuth defaults a missing claim to []).
  permissions?: Permission[];
  email: string;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwtAccessSecret, {
    expiresIn: config.accessTokenTtlMinutes * 60, // seconds
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.jwtAccessSecret) as AccessTokenPayload;
}

/** Opaque refresh token; only its SHA-256 hash is persisted. */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString("hex");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Opaque 256-bit capability token for candidate invitation links. */
export function generateCandidateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Opaque password-reset token; only its SHA-256 hash is persisted. */
export function generatePasswordResetToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}
