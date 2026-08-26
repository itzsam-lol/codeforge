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
  // Optional for the same reason — tokens issued before this field existed
  // default to false (legacy/unrestricted-if-empty) in requireAuth, until
  // the user's next login/refresh reissues a token with it set.
  permissionsExplicit?: boolean;
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

// ---------------------------------------------------------------------------
// CodeForge Arena: a deliberately separate token type/secret from the staff
// AccessTokenPayload above — ArenaUser has no orgId/role/permissions, and
// signing with a different secret means an Arena token can never be mistaken
// for (or forged into) a staff token even if verification code were ever
// accidentally cross-wired.
// ---------------------------------------------------------------------------

export interface ArenaAccessTokenPayload {
  sub: string;
  email: string;
  name: string;
}

export function signArenaAccessToken(payload: ArenaAccessTokenPayload): string {
  return jwt.sign(payload, config.arenaJwtAccessSecret, {
    expiresIn: config.accessTokenTtlMinutes * 60,
  });
}

export function verifyArenaAccessToken(token: string): ArenaAccessTokenPayload {
  return jwt.verify(token, config.arenaJwtAccessSecret) as ArenaAccessTokenPayload;
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

/** Opaque 2FA login-challenge token; only its SHA-256 hash is persisted. */
export function generateTwoFactorChallengeToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

/** Ten single-use backup codes (XXXX-XXXX), shown once at 2FA enrollment. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
