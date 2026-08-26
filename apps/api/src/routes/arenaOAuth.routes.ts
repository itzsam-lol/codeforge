import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { asyncHandler, badRequest, serviceUnavailable, unauthorized } from "../lib/errors";
import { validateBody } from "../middleware/validate";
import { authLimiter } from "../middleware/rateLimit";
import { createOAuthExchangeCode, consumeOAuthExchangeCode, createOAuthState, consumeOAuthState } from "../lib/arenaOAuthState";
import { issueArenaTokens } from "./arenaAuth.routes";
import { arenaSelfView } from "../services/arenaProfile";
import { generateUniqueHandleFor } from "../services/arenaHandle";

/**
 * Hand-rolled OAuth2 (plain fetch, no passport/SDK) — matches this
 * codebase's existing style for every other external HTTP integration
 * (Resend, Groq, HQ ingest calls all use bare fetch). Login-identity only:
 * provider access tokens are used once to fetch the user's identity and are
 * never stored, so there's nothing to encrypt at rest and no ongoing calls
 * back to Google/GitHub after sign-in.
 */

function callbackUrl(provider: "google" | "github") {
  return `${config.arenaMarketingOrigin}/api/arena/auth/${provider}/callback`;
}

async function findOrCreateArenaUser(params: {
  provider: "google" | "github";
  providerUserId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}) {
  const { provider, providerUserId, email, name, avatarUrl } = params;
  const existingAccount = await prisma.arenaOAuthAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    include: { user: true },
  });
  if (existingAccount) return existingAccount.user;

  const normalizedEmail = email.toLowerCase();
  const existingUser = await prisma.arenaUser.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    await prisma.arenaOAuthAccount.create({
      data: { userId: existingUser.id, provider, providerUserId },
    });
    return existingUser;
  }

  const handle = await generateUniqueHandleFor(name || normalizedEmail.split("@")[0]);
  return prisma.arenaUser.create({
    data: {
      email: normalizedEmail,
      passwordHash: null,
      name: name || normalizedEmail.split("@")[0],
      handle,
      avatarUrl: avatarUrl ?? undefined,
      emailVerifiedAt: new Date(),
      oauthAccounts: { create: { provider, providerUserId } },
    },
  });
}

export const arenaOAuthRouter = Router();

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

arenaOAuthRouter.get(
  "/google/start",
  authLimiter,
  asyncHandler(async (_req: Request, res: Response) => {
    if (!config.arenaGoogleClientId) throw serviceUnavailable("Google sign-in is not configured");
    const state = await createOAuthState();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", config.arenaGoogleClientId);
    url.searchParams.set("redirect_uri", callbackUrl("google"));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  })
);

arenaOAuthRouter.get(
  "/google/callback",
  authLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!config.arenaGoogleClientId || !config.arenaGoogleClientSecret) {
      throw serviceUnavailable("Google sign-in is not configured");
    }
    if (!code || !state || !(await consumeOAuthState(state))) {
      throw badRequest("Invalid or expired sign-in attempt, please try again");
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.arenaGoogleClientId,
        client_secret: config.arenaGoogleClientSecret,
        code,
        redirect_uri: callbackUrl("google"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw serviceUnavailable("Google sign-in failed, please try again");
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) throw serviceUnavailable("Google sign-in failed, please try again");
    const profile = (await userRes.json()) as { sub: string; email?: string; name?: string; picture?: string };
    if (!profile.email) throw badRequest("Your Google account has no email to sign in with");

    const user = await findOrCreateArenaUser({
      provider: "google",
      providerUserId: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email,
      avatarUrl: profile.picture,
    });
    const exchangeCode = await createOAuthExchangeCode(user.id);
    res.redirect(`${config.arenaMarketingOrigin}/arena/auth/callback?code=${exchangeCode}`);
  })
);

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

arenaOAuthRouter.get(
  "/github/start",
  authLimiter,
  asyncHandler(async (_req: Request, res: Response) => {
    if (!config.arenaGithubClientId) throw serviceUnavailable("GitHub sign-in is not configured");
    const state = await createOAuthState();
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", config.arenaGithubClientId);
    url.searchParams.set("redirect_uri", callbackUrl("github"));
    url.searchParams.set("scope", "read:user user:email");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  })
);

arenaOAuthRouter.get(
  "/github/callback",
  authLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!config.arenaGithubClientId || !config.arenaGithubClientSecret) {
      throw serviceUnavailable("GitHub sign-in is not configured");
    }
    if (!code || !state || !(await consumeOAuthState(state))) {
      throw badRequest("Invalid or expired sign-in attempt, please try again");
    }

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: config.arenaGithubClientId,
        client_secret: config.arenaGithubClientSecret,
        code,
        redirect_uri: callbackUrl("github"),
      }),
    });
    if (!tokenRes.ok) throw serviceUnavailable("GitHub sign-in failed, please try again");
    const tokenBody = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenBody.access_token) throw serviceUnavailable("GitHub sign-in failed, please try again");

    const headers = {
      Authorization: `Bearer ${tokenBody.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "codeforge-arena",
    };
    const userRes = await fetch("https://api.github.com/user", { headers });
    if (!userRes.ok) throw serviceUnavailable("GitHub sign-in failed, please try again");
    const profile = (await userRes.json()) as { id: number; login: string; name?: string; avatar_url?: string; email?: string | null };

    // GitHub's /user.email is null when the user's email is private — the
    // dedicated /user/emails endpoint is the only reliable way to get one.
    let email = profile.email;
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
        email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? null;
      }
    }
    if (!email) throw badRequest("Your GitHub account has no verified email to sign in with");

    const user = await findOrCreateArenaUser({
      provider: "github",
      providerUserId: String(profile.id),
      email,
      name: profile.name ?? profile.login,
      avatarUrl: profile.avatar_url,
    });
    const exchangeCode = await createOAuthExchangeCode(user.id);
    res.redirect(`${config.arenaMarketingOrigin}/arena/auth/callback?code=${exchangeCode}`);
  })
);

// ---------------------------------------------------------------------------
// Exchange: marketing calls this immediately after the redirect above lands,
// trading the one-time code for the real token pair.
// ---------------------------------------------------------------------------

arenaOAuthRouter.post(
  "/oauth/exchange",
  authLimiter,
  validateBody(z.object({ code: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body as { code: string };
    const userId = await consumeOAuthExchangeCode(code);
    if (!userId) throw unauthorized("This sign-in link has expired, please try again");
    const user = await prisma.arenaUser.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized("This sign-in link has expired, please try again");
    const accessToken = await issueArenaTokens(req, res, user);
    res.json({ accessToken, user: arenaSelfView(user) });
  })
);
