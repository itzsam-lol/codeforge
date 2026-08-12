import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { HqPermission } from "./permissions";
import { config } from "../config";

export interface AccessTokenPayload {
  sub: string;
  role: "owner" | "staff";
  permissions: HqPermission[];
  email: string;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwtAccessSecret, {
    expiresIn: config.accessTokenTtlMinutes * 60,
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

/** Opaque password-reset token; only its SHA-256 hash is persisted. */
export function generatePasswordResetToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

/** Opaque 2FA login-challenge token; only its SHA-256 hash is persisted. */
export function generateTwoFactorChallengeToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

/** Ten single-use backup codes (XXXXX-XXXXX), shown once at 2FA enrollment. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
