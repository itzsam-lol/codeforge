import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { z } from "zod";
import type { Permission, Role } from "@codeforge/shared";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import {
  generateBackupCodes,
  generatePasswordResetToken,
  generateRefreshToken,
  generateTwoFactorChallengeToken,
  hashToken,
  signAccessToken,
} from "../lib/tokens";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { asyncHandler, badRequest, conflict, unauthorized } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { authLimiter } from "../middleware/rateLimit";
import { audit } from "../services/audit";
import { sendPasswordResetEmail } from "../lib/email";

const REFRESH_COOKIE = "cf_refresh";

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.isProd,
    path: "/api/auth",
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

async function issueTokens(
  req: Request,
  res: Response,
  user: { id: string; orgId: string; role: Role; permissions: Permission[]; email: string; name: string }
) {
  const accessToken = signAccessToken({
    sub: user.id,
    orgId: user.orgId,
    role: user.role,
    permissions: user.permissions,
    email: user.email,
    name: user.name,
  });
  const { raw, hash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000),
      ipAddress: req.ip,
      userAgent: (req.headers["user-agent"] as string | undefined)?.slice(0, 500) ?? null,
    },
  });
  res.cookie(REFRESH_COOKIE, raw, refreshCookieOptions());
  return accessToken;
}

export const authRouter = Router();

authRouter.post(
  "/login",
  authLimiter,
  validateBody(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Compare against a dummy hash on unknown emails to keep timing uniform.
    const hash = user?.passwordHash ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpUvW1RrWJ7v0PoZ0z0J8mZBqfDS2";
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) throw unauthorized("Invalid email or password");
    if (!user.isActive) throw unauthorized("This account has been deactivated");

    if (user.twoFactorEnabledAt) {
      const { raw, hash: challengeHash } = generateTwoFactorChallengeToken();
      await prisma.twoFactorChallenge.create({
        data: { userId: user.id, tokenHash: challengeHash, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      });
      res.json({ twoFactorRequired: true, challengeToken: raw });
      return;
    }

    const accessToken = await issueTokens(req, res, {
      id: user.id,
      orgId: user.orgId,
      role: user.role as Role,
      permissions: user.permissions as Permission[],
      email: user.email,
      name: user.name,
    });
    res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        twoFactorEnabled: false,
      },
    });
  })
);

authRouter.post(
  "/2fa/verify",
  authLimiter,
  validateBody(z.object({ challengeToken: z.string().min(1), code: z.string().min(1).max(20) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { challengeToken, code } = req.body as { challengeToken: string; code: string };
    const challenge = await prisma.twoFactorChallenge.findUnique({
      where: { tokenHash: hashToken(challengeToken) },
      include: { user: true },
    });
    if (!challenge || challenge.expiresAt < new Date() || !challenge.user.isActive) {
      throw unauthorized("This login attempt has expired, sign in again");
    }
    const { user } = challenge;
    if (!user.twoFactorSecret) throw unauthorized("This login attempt has expired, sign in again");

    const normalized = code.trim().toUpperCase();
    const validTotp =
      /^\d{6}$/.test(code.trim()) && authenticator.verify({ token: code.trim(), secret: decryptSecret(user.twoFactorSecret) });

    let usedBackupCode: string | null = null;
    if (!validTotp) {
      for (const stored of user.twoFactorBackupCodes) {
        if (await bcrypt.compare(normalized, stored)) {
          usedBackupCode = stored;
          break;
        }
      }
    }
    if (!validTotp && !usedBackupCode) throw unauthorized("Invalid code");

    await prisma.$transaction([
      prisma.twoFactorChallenge.delete({ where: { id: challenge.id } }),
      ...(usedBackupCode
        ? [
            prisma.user.update({
              where: { id: user.id },
              data: { twoFactorBackupCodes: user.twoFactorBackupCodes.filter((c) => c !== usedBackupCode) },
            }),
          ]
        : []),
    ]);

    const accessToken = await issueTokens(req, res, {
      id: user.id,
      orgId: user.orgId,
      role: user.role as Role,
      permissions: user.permissions as Permission[],
      email: user.email,
      name: user.name,
    });
    res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        twoFactorEnabled: true,
      },
    });
  })
);

authRouter.post(
  "/refresh",
  authLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) throw unauthorized("Missing refresh token");
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
      res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
      throw unauthorized("Session expired, sign in again");
    }
    // Rotate: revoke the presented token, issue a fresh pair.
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const accessToken = await issueTokens(req, res, {
      id: stored.user.id,
      orgId: stored.user.orgId,
      role: stored.user.role as Role,
      permissions: stored.user.permissions as Permission[],
      email: stored.user.email,
      name: stored.user.name,
    });
    res.json({
      accessToken,
      user: {
        id: stored.user.id,
        name: stored.user.name,
        email: stored.user.email,
        role: stored.user.role,
        permissions: stored.user.permissions,
        twoFactorEnabled: Boolean(stored.user.twoFactorEnabledAt),
      },
    });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req: Request, res: Response) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    res.json({ ok: true });
  })
);

authRouter.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

/**
 * Active sessions = non-revoked, non-expired RefreshToken rows. Refresh
 * always rotates (revokes the presented row, issues a new one), so at most
 * one non-revoked row exists per device at a time — no separate "session id"
 * needed, the RefreshToken row IS the session.
 */
authRouter.get(
  "/sessions",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const currentRaw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const currentHash = currentRaw ? hashToken(currentRaw) : null;
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true, tokenHash: true, createdAt: true, lastUsedAt: true, userAgent: true, ipAddress: true },
    });
    res.json({
      sessions: sessions.map(({ tokenHash, ...s }) => ({ ...s, isCurrent: tokenHash === currentHash })),
    });
  })
);

authRouter.delete(
  "/sessions/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const session = await prisma.refreshToken.findFirst({
      where: { id: req.params.id, userId: req.user!.id, revokedAt: null },
    });
    if (!session) throw unauthorized("Session not found");
    await prisma.refreshToken.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
  })
);

/** Sign out every session except the one making this request. */
authRouter.delete(
  "/sessions",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const currentRaw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const currentHash = currentRaw ? hashToken(currentRaw) : null;
    await prisma.refreshToken.updateMany({
      where: { userId: req.user!.id, revokedAt: null, tokenHash: { not: currentHash ?? undefined } },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true });
  })
);

authRouter.get(
  "/2fa/status",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json({
      enabled: Boolean(user.twoFactorEnabledAt),
      backupCodesRemaining: user.twoFactorBackupCodes.length,
    });
  })
);

/** Step 1 of enrollment: generate + stash a pending secret, not yet enabled
 *  until /2fa/confirm verifies the user actually has it in an app. */
authRouter.post(
  "/2fa/enroll",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (user.twoFactorEnabledAt) throw conflict("Two-factor authentication is already enabled");

    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: encryptSecret(secret) } });
    const uri = authenticator.keyuri(user.email, "CodeForge", secret);
    const qrCodeDataUrl = await QRCode.toDataURL(uri);
    res.json({ secret, qrCodeDataUrl });
  })
);

/** Step 2: verify the pending secret with a live code, enable, issue backup codes. */
authRouter.post(
  "/2fa/confirm",
  requireAuth,
  validateBody(z.object({ code: z.string().min(1).max(20) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body as { code: string };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (user.twoFactorEnabledAt) throw conflict("Two-factor authentication is already enabled");
    if (!user.twoFactorSecret) throw badRequest("Start enrollment first");
    if (!authenticator.verify({ token: code.trim(), secret: decryptSecret(user.twoFactorSecret) })) {
      throw unauthorized("Invalid code");
    }

    const backupCodes = generateBackupCodes();
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabledAt: new Date(), twoFactorBackupCodes: hashed },
    });
    await audit(req.user!.orgId, req.user!.id, "user.2fa_enabled", "User", user.id, {});
    res.json({ backupCodes });
  })
);

authRouter.post(
  "/2fa/disable",
  requireAuth,
  validateBody(z.object({ currentPassword: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { currentPassword } = req.body as { currentPassword: string };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw unauthorized("Current password is incorrect");

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorBackupCodes: [] },
    });
    await audit(req.user!.orgId, req.user!.id, "user.2fa_disabled", "User", user.id, {});
    res.json({ ok: true });
  })
);

const updateMeSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().max(320).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8).max(200).optional(),
  })
  .refine((v) => !v.email || v.currentPassword, {
    message: "Enter your current password to change your email",
    path: ["currentPassword"],
  })
  .refine((v) => !v.newPassword || v.currentPassword, {
    message: "Enter your current password to set a new one",
    path: ["currentPassword"],
  });

/** Self-service profile update: name freely, email/password require re-auth. */
authRouter.put(
  "/me",
  requireAuth,
  validateBody(updateMeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, currentPassword, newPassword } = req.body as z.infer<typeof updateMeSchema>;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

    if (currentPassword) {
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) throw unauthorized("Current password is incorrect");
    }

    if (email && email.toLowerCase() !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) throw conflict("That email is already in use");
    }

    const data: { name?: string; email?: string; passwordHash?: string } = {};
    if (name) data.name = name;
    if (email) data.email = email.toLowerCase();
    if (newPassword) data.passwordHash = await bcrypt.hash(newPassword, 12);

    const updated = await prisma.user.update({ where: { id: user.id }, data });

    if (newPassword) {
      // Changing your own password signs out every other active session.
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await audit(req.user!.orgId, req.user!.id, "user.self_update", "User", user.id, {
      nameChanged: Boolean(name),
      emailChanged: Boolean(email),
      passwordChanged: Boolean(newPassword),
    });

    res.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        permissions: updated.permissions,
      },
    });
  })
);

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

authRouter.post(
  "/forgot-password",
  authLimiter,
  validateBody(z.object({ email: z.string().email() })),
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body as { email: string };
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always respond the same way regardless of whether the account exists,
    // so this endpoint can't be used to enumerate registered emails.
    if (user && user.isActive) {
      const { raw, hash } = generatePasswordResetToken();
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      });
      const link = `${config.webOrigin}/reset-password?token=${raw}`;
      await sendPasswordResetEmail({ to: user.email, name: user.name, link });
    }
    res.json({ ok: true });
  })
);

authRouter.post(
  "/reset-password",
  authLimiter,
  validateBody(z.object({ token: z.string().min(1), newPassword: z.string().min(8).max(200) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body as { token: string; newPassword: string };
    const stored = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw unauthorized("This reset link is invalid or has expired");
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
      // A successful reset signs out every existing session.
      prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    res.json({ ok: true });
  })
);
