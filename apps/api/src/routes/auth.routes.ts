import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@codeforge/shared";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "../lib/tokens";
import { asyncHandler, unauthorized } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { authLimiter } from "../middleware/rateLimit";

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

async function issueTokens(res: Response, user: { id: string; orgId: string; role: Role; email: string; name: string }) {
  const accessToken = signAccessToken({
    sub: user.id,
    orgId: user.orgId,
    role: user.role,
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

    const accessToken = await issueTokens(res, {
      id: user.id,
      orgId: user.orgId,
      role: user.role as Role,
      email: user.email,
      name: user.name,
    });
    res.json({
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
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
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
      throw unauthorized("Session expired — sign in again");
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
