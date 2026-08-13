import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { z } from "zod";
import type { HqPermission } from "../lib/permissions";
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
import { decryptTotpSecret, encryptTotpSecret } from "../lib/crypto";
import { asyncHandler, badRequest, conflict, unauthorized } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { authLimiter } from "../middleware/rateLimit";
import { sendPasswordResetEmail } from "../lib/email";

const REFRESH_COOKIE = "hq_refresh";

// Per-account brute-force lockout (see schema.prisma's HqStaff.lockedUntil
// comment) — independent of authLimiter's IP-keyed window. Mirrors
// apps/api/src/routes/auth.routes.ts exactly.
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

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
  staff: { id: string; role: "owner" | "staff"; permissions: HqPermission[]; email: string; name: string }
) {
  const accessToken = signAccessToken({
    sub: staff.id,
    role: staff.role,
    permissions: staff.permissions,
    email: staff.email,
    name: staff.name,
  });
  const { raw, hash } = generateRefreshToken();
  await prisma.hqRefreshToken.create({
    data: {
      staffId: staff.id,
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
    const staff = await prisma.hqStaff.findUnique({ where: { email: email.toLowerCase() } });

    if (staff?.lockedUntil && staff.lockedUntil > new Date()) {
      throw unauthorized("Too many failed attempts. Try again later.");
    }

    const hash = staff?.passwordHash ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpUvW1RrWJ7v0PoZ0z0J8mZBqfDS2";
    const ok = await bcrypt.compare(password, hash);
    if (!staff || !ok) {
      if (staff) {
        const attempts = staff.failedLoginAttempts + 1;
        await prisma.hqStaff.update({
          where: { id: staff.id },
          data:
            attempts >= MAX_LOGIN_ATTEMPTS
              ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_MS) }
              : { failedLoginAttempts: attempts },
        });
      }
      throw unauthorized("Invalid email or password");
    }
    if (!staff.isActive) throw unauthorized("This account has been deactivated");

    if (staff.failedLoginAttempts > 0 || staff.lockedUntil) {
      await prisma.hqStaff.update({ where: { id: staff.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }

    if (staff.twoFactorEnabledAt) {
      const { raw, hash: challengeHash } = generateTwoFactorChallengeToken();
      await prisma.hqTwoFactorChallenge.create({
        data: { staffId: staff.id, tokenHash: challengeHash, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      });
      res.json({ twoFactorRequired: true, challengeToken: raw });
      return;
    }

    const accessToken = await issueTokens(req, res, {
      id: staff.id,
      role: staff.role,
      permissions: staff.permissions as HqPermission[],
      email: staff.email,
      name: staff.name,
    });
    res.json({
      accessToken,
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        permissions: staff.permissions,
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
    const challenge = await prisma.hqTwoFactorChallenge.findUnique({
      where: { tokenHash: hashToken(challengeToken) },
      include: { staff: true },
    });
    if (!challenge || challenge.expiresAt < new Date() || !challenge.staff.isActive) {
      throw unauthorized("This login attempt has expired, sign in again");
    }
    const { staff } = challenge;
    if (!staff.twoFactorSecret) throw unauthorized("This login attempt has expired, sign in again");

    const normalized = code.trim().toUpperCase();
    const validTotp =
      /^\d{6}$/.test(code.trim()) &&
      authenticator.verify({ token: code.trim(), secret: decryptTotpSecret(staff.twoFactorSecret) });

    let usedBackupCode: string | null = null;
    if (!validTotp) {
      for (const stored of staff.twoFactorBackupCodes) {
        if (await bcrypt.compare(normalized, stored)) {
          usedBackupCode = stored;
          break;
        }
      }
    }
    if (!validTotp && !usedBackupCode) throw unauthorized("Invalid code");

    await prisma.$transaction([
      prisma.hqTwoFactorChallenge.delete({ where: { id: challenge.id } }),
      ...(usedBackupCode
        ? [
            prisma.hqStaff.update({
              where: { id: staff.id },
              data: { twoFactorBackupCodes: staff.twoFactorBackupCodes.filter((c) => c !== usedBackupCode) },
            }),
          ]
        : []),
    ]);

    const accessToken = await issueTokens(req, res, {
      id: staff.id,
      role: staff.role,
      permissions: staff.permissions as HqPermission[],
      email: staff.email,
      name: staff.name,
    });
    res.json({
      accessToken,
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        permissions: staff.permissions,
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
    const stored = await prisma.hqRefreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { staff: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.staff.isActive) {
      res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
      throw unauthorized("Session expired, sign in again");
    }
    await prisma.hqRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const accessToken = await issueTokens(req, res, {
      id: stored.staff.id,
      role: stored.staff.role,
      permissions: stored.staff.permissions as HqPermission[],
      email: stored.staff.email,
      name: stored.staff.name,
    });
    res.json({
      accessToken,
      staff: {
        id: stored.staff.id,
        name: stored.staff.name,
        email: stored.staff.email,
        role: stored.staff.role,
        permissions: stored.staff.permissions,
        twoFactorEnabled: Boolean(stored.staff.twoFactorEnabledAt),
      },
    });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req: Request, res: Response) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) {
      await prisma.hqRefreshToken.updateMany({
        where: { tokenHash: hashToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    res.json({ ok: true });
  })
);

authRouter.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json({ staff: req.staff });
});

authRouter.get(
  "/sessions",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const currentRaw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const currentHash = currentRaw ? hashToken(currentRaw) : null;
    const sessions = await prisma.hqRefreshToken.findMany({
      where: { staffId: req.staff!.id, revokedAt: null, expiresAt: { gt: new Date() } },
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
    const session = await prisma.hqRefreshToken.findFirst({
      where: { id: req.params.id, staffId: req.staff!.id, revokedAt: null },
    });
    if (!session) throw unauthorized("Session not found");
    await prisma.hqRefreshToken.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
  })
);

authRouter.delete(
  "/sessions",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const currentRaw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const currentHash = currentRaw ? hashToken(currentRaw) : null;
    await prisma.hqRefreshToken.updateMany({
      where: { staffId: req.staff!.id, revokedAt: null, tokenHash: { not: currentHash ?? undefined } },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true });
  })
);

authRouter.get(
  "/2fa/status",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const staff = await prisma.hqStaff.findUniqueOrThrow({ where: { id: req.staff!.id } });
    res.json({
      enabled: Boolean(staff.twoFactorEnabledAt),
      backupCodesRemaining: staff.twoFactorBackupCodes.length,
    });
  })
);

authRouter.post(
  "/2fa/enroll",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const staff = await prisma.hqStaff.findUniqueOrThrow({ where: { id: req.staff!.id } });
    if (staff.twoFactorEnabledAt) throw conflict("Two-factor authentication is already enabled");

    const secret = authenticator.generateSecret();
    await prisma.hqStaff.update({ where: { id: staff.id }, data: { twoFactorSecret: encryptTotpSecret(secret) } });
    const uri = authenticator.keyuri(staff.email, "CodeForge HQ", secret);
    const qrCodeDataUrl = await QRCode.toDataURL(uri);
    res.json({ secret, qrCodeDataUrl });
  })
);

authRouter.post(
  "/2fa/confirm",
  requireAuth,
  validateBody(z.object({ code: z.string().min(1).max(20) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body as { code: string };
    const staff = await prisma.hqStaff.findUniqueOrThrow({ where: { id: req.staff!.id } });
    if (staff.twoFactorEnabledAt) throw conflict("Two-factor authentication is already enabled");
    if (!staff.twoFactorSecret) throw badRequest("Start enrollment first");
    if (!authenticator.verify({ token: code.trim(), secret: decryptTotpSecret(staff.twoFactorSecret) })) {
      throw unauthorized("Invalid code");
    }

    const backupCodes = generateBackupCodes();
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 12)));
    await prisma.hqStaff.update({
      where: { id: staff.id },
      data: { twoFactorEnabledAt: new Date(), twoFactorBackupCodes: hashed },
    });
    res.json({ backupCodes });
  })
);

authRouter.post(
  "/2fa/disable",
  requireAuth,
  validateBody(z.object({ currentPassword: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { currentPassword } = req.body as { currentPassword: string };
    const staff = await prisma.hqStaff.findUniqueOrThrow({ where: { id: req.staff!.id } });
    const ok = await bcrypt.compare(currentPassword, staff.passwordHash);
    if (!ok) throw unauthorized("Current password is incorrect");

    await prisma.hqStaff.update({
      where: { id: staff.id },
      data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorBackupCodes: [] },
    });
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
    const staff = await prisma.hqStaff.findUniqueOrThrow({ where: { id: req.staff!.id } });

    if (currentPassword) {
      const ok = await bcrypt.compare(currentPassword, staff.passwordHash);
      if (!ok) throw unauthorized("Current password is incorrect");
    }

    if (email && email.toLowerCase() !== staff.email) {
      const existing = await prisma.hqStaff.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) throw conflict("That email is already in use");
    }

    const data: { name?: string; email?: string; passwordHash?: string } = {};
    if (name) data.name = name;
    if (email) data.email = email.toLowerCase();
    if (newPassword) data.passwordHash = await bcrypt.hash(newPassword, 12);

    const updated = await prisma.hqStaff.update({ where: { id: staff.id }, data });

    if (newPassword) {
      await prisma.hqRefreshToken.updateMany({
        where: { staffId: staff.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    res.json({
      staff: {
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
    const staff = await prisma.hqStaff.findUnique({ where: { email: email.toLowerCase() } });
    if (staff && staff.isActive) {
      const { raw, hash } = generatePasswordResetToken();
      await prisma.hqPasswordResetToken.create({
        data: { staffId: staff.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      });
      const link = `${config.webOrigin}/reset-password?token=${raw}`;
      await sendPasswordResetEmail({ to: staff.email, name: staff.name, link });
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
    const stored = await prisma.hqPasswordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { staff: true },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date() || !stored.staff.isActive) {
      throw unauthorized("This reset link is invalid or has expired");
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.hqStaff.update({ where: { id: stored.staffId }, data: { passwordHash } }),
      prisma.hqPasswordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
      prisma.hqRefreshToken.updateMany({
        where: { staffId: stored.staffId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    res.json({ ok: true });
  })
);
