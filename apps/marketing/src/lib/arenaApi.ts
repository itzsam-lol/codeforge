"use client";

/**
 * Browser-side API client for Arena. Mirrors apps/web/src/lib/api.ts's
 * staffApi shape (same refresh-retry pattern, same httpOnly-cookie +
 * in-memory-bearer-token split — the token lives ONLY in this
 * module-private variable, never localStorage, so an XSS payload has no
 * reference to reach it) but talks to Arena's auth endpoints
 * (/api/arena/auth/*) instead, via the /api/arena rewrite in
 * next.config.mjs.
 */

let memToken: string | null = null;

export function getArenaToken(): string | null {
  return memToken;
}

export function setArenaToken(token: string | null) {
  memToken = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: { path: string; message: string }[]
  ) {
    super(message);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string; details?: { path: string; message: string }[] };
    return new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.details);
  } catch {
    return new ApiError(res.status, `Request failed (${res.status})`);
  }
}

interface RequestInitLite {
  method?: string;
  body?: unknown;
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch("/api/arena/auth/refresh", { method: "POST", credentials: "include" });
        if (!res.ok) {
          setArenaToken(null);
          return false;
        }
        const data = (await res.json()) as { accessToken: string };
        setArenaToken(data.accessToken);
        return true;
      } catch {
        return false;
      }
    })();
  }
  const result = await refreshInFlight;
  refreshInFlight = null;
  return result;
}

/** Used as SWR's fetcher directly (arenaApi<T>(key)) and for one-off calls. */
export async function arenaApi<T>(path: string, init: RequestInitLite = {}): Promise<T> {
  const doFetch = () =>
    fetch(path, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(getArenaToken() ? { Authorization: `Bearer ${getArenaToken()}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

  let res = await doFetch();
  if (res.status === 401 && path !== "/api/arena/auth/refresh") {
    if (await tryRefresh()) res = await doFetch();
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export interface ArenaUser {
  id: string;
  email: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  bio: string;
  country: string | null;
  rating: number;
  emailVerified: boolean;
  createdAt: string;
  /** Only present on GET/PUT /api/arena/me — see arenaSelfViewWithStreak. */
  currentStreak?: number;
}

export async function arenaRegister(email: string, password: string, name: string): Promise<ArenaUser> {
  const data = await arenaApi<{ accessToken: string; user: ArenaUser }>("/api/arena/auth/register", {
    method: "POST",
    body: { email, password, name },
  });
  setArenaToken(data.accessToken);
  return data.user;
}

export async function arenaLogin(email: string, password: string): Promise<ArenaUser> {
  const data = await arenaApi<{ accessToken: string; user: ArenaUser }>("/api/arena/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setArenaToken(data.accessToken);
  return data.user;
}

export async function arenaLogout(): Promise<void> {
  await arenaApi("/api/arena/auth/logout", { method: "POST" }).catch(() => undefined);
  setArenaToken(null);
}

/** Trades the one-time code from an OAuth redirect for a real session — see
 *  app/arena/auth/callback/page.tsx. */
export async function arenaOAuthExchange(code: string): Promise<ArenaUser> {
  const data = await arenaApi<{ accessToken: string; user: ArenaUser }>("/api/arena/auth/oauth/exchange", {
    method: "POST",
    body: { code },
  });
  setArenaToken(data.accessToken);
  return data.user;
}
