/**
 * Browser-side API client. All requests go to the same origin (/api/...) and
 * are proxied to the API by next.config rewrites, so the httpOnly refresh
 * cookie is first-party.
 *
 * The short-lived access token lives ONLY in this module-private variable —
 * never in localStorage, never on `window`. An XSS payload that runs inside
 * this page can't reach a closure-scoped `let` it has no reference to, which
 * is the whole point: localStorage is readable by any script running on the
 * page, this isn't. The cost is that a full page reload always loses the
 * token; every caller already tolerates that via the 401-triggered
 * tryRefresh() below, which re-mints one from the httpOnly refresh cookie.
 */
import type { Permission, Role } from "@codeforge/shared";

let memToken: string | null = null;

export function getToken(): string | null {
  return memToken;
}

export function setToken(token: string | null) {
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
        const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
        if (!res.ok) {
          setToken(null);
          return false;
        }
        const data = (await res.json()) as { accessToken: string };
        setToken(data.accessToken);
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

/** Authenticated staff request with a single transparent refresh-retry. */
export async function staffApi<T>(path: string, init: RequestInitLite = {}): Promise<T> {
  const doFetch = () =>
    fetch(path, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

  let res = await doFetch();
  if (res.status === 401) {
    if (await tryRefresh()) res = await doFetch();
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

/** Authenticated staff download (CSV/PDF export): triggers a browser save. */
export async function staffApiDownload(path: string, filenameFallback: string): Promise<void> {
  const res = await fetch(path, {
    credentials: "include",
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!res.ok) throw await toApiError(res);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? filenameFallback;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Candidate request authenticated by the invitation-link token. */
export async function candidateApi<T>(
  token: string,
  path: string,
  init: RequestInitLite = {}
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: {
      "x-candidate-token": token,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  twoFactorEnabled?: boolean;
}

export type LoginResult = { twoFactorRequired: true; challengeToken: string } | { twoFactorRequired?: false; user: StaffUser };

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await toApiError(res);
  const data = (await res.json()) as
    | { twoFactorRequired: true; challengeToken: string }
    | { accessToken: string; user: StaffUser };
  if ("twoFactorRequired" in data) return { twoFactorRequired: true, challengeToken: data.challengeToken };
  setToken(data.accessToken);
  return { user: data.user };
}

export async function verifyTwoFactor(challengeToken: string, code: string): Promise<StaffUser> {
  const res = await fetch("/api/auth/2fa/verify", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeToken, code }),
  });
  if (!res.ok) throw await toApiError(res);
  const data = (await res.json()) as { accessToken: string; user: StaffUser };
  setToken(data.accessToken);
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
  setToken(null);
}
