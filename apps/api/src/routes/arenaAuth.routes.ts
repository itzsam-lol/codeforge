import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { generateRefreshToken, hashToken, signArenaAccessToken } from "../lib/tokens";
import { asyncHandler, conflict, unauthorized } from "../lib/errors";
import { validateBody } from "../middleware/validate";
import { authLimiter } from "../middleware/rateLimit";
import { arenaSelfView } from "../services/arenaProfile";
import { generateUniqueHandleFor } from "../services/arenaHandle";

const REFRESH_COOKIE = "cf_arena_refresh";

// Same per-account brute-force lockout pattern as staff login
// (routes/auth.routes.ts) — independent of authLimiter's IP-keyed window.
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.isProd,
    path: "/api/arena/auth",
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

interface ArenaUserLike {
  id: string;
  email: string;
  name: string;
}

export async function issueArenaTokens(req: Request, res: Response, user: ArenaUserLike): Promise<string> {
  const accessToken = signArenaAccessToken({ sub: user.id, email: user.email, name: user.name });
  const { raw, hash } = generateRefreshToken();
  await prisma.arenaRefreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000),
    },
  });
  res.cookie(REFRESH_COOKIE, raw, refreshCookieOptions());
  return accessToken;
}

export const arenaAuthRouter = Router();

arenaAuthRouter.post(
  "/register",
  authLimiter,
  validateBody(
    z.object({
      email: z.string().email(),
      password: z.string().min(8).max(200),
      name: z.string().min(1).max(200),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, name } = req.body as { email: string; password: string; name: string };
    const normalizedEmail = email.toLowerCase();
    const existing = await prisma.arenaUser.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw conflict("An account with that email already exists");

    const passwordHash = await bcrypt.hash(password, 12);
    const handle = await generateUniqueHandleFor(name);
    const user = await prisma.arenaUser.create({
      data: { email: normalizedEmail, passwordHash, name, handle },
    });

    const accessToken = await issueArenaTokens(req, res, user);
    res.status(201).json({ accessToken, user: arenaSelfView(user) });
  })
);

arenaAuthRouter.post(
  "/login",
  authLimiter,
  validateBody(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = await prisma.arenaUser.findUnique({ where: { email: email.toLowerCase() } });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw unauthorized("Too many failed attempts. Try again later.");
    }

    // Compare against a dummy hash on unknown emails / OAuth-only accounts
    // (null passwordHash) to keep timing uniform and avoid leaking which
    // emails are registered.
    const hash = user?.passwordHash ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpUvW1RrWJ7v0PoZ0z0J8mZBqfDS2";
    const ok = await bcrypt.compare(password, hash);
    if (!user || !user.passwordHash || !ok) {
      if (user) {
        const attempts = user.failedLoginAttempts + 1;
        await prisma.arenaUser.update({
          where: { id: user.id },
          data:
            attempts >= MAX_LOGIN_ATTEMPTS
              ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_MS) }
              : { failedLoginAttempts: attempts },
        });
      }
      throw unauthorized("Invalid email or password");
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await prisma.arenaUser.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }

    const accessToken = await issueArenaTokens(req, res, user);
    res.json({ accessToken, user: arenaSelfView(user) });
  })
);

arenaAuthRouter.post(
  "/refresh",
  authLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) throw unauthorized("Missing refresh token");
    const stored = await prisma.arenaRefreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      res.clearCookie(REFRESH_COOKIE, { path: "/api/arena/auth" });
      throw unauthorized("Session expired, sign in again");
    }
    // Rotate: revoke the presented token, issue a fresh pair.
    await prisma.arenaRefreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const accessToken = await issueArenaTokens(req, res, stored.user);
    res.json({ accessToken, user: arenaSelfView(stored.user) });
  })
);

arenaAuthRouter.post(
  "/logout",
  asyncHandler(async (req: Request, res: Response) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) {
      await prisma.arenaRefreshToken.updateMany({
        where: { tokenHash: hashToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(REFRESH_COOKIE, { path: "/api/arena/auth" });
    res.json({ ok: true });
  })
);
