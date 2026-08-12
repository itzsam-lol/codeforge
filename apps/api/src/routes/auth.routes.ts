import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import type { Permission, Role } from "@codeforge/shared";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import {
  generatePasswordResetToken,
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "../lib/tokens";
import { asyncHandler, conflict, unauthorized } from "../lib/errors";
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

    const accessToken = await issueTokens(res, {
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
    const accessToken = await issueTokens(res, {
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
