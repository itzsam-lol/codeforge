/**
 * Browser-side API client for HQ. Mirrors apps/web/src/lib/api.ts's shape
 * (same refresh-retry pattern, same httpOnly-cookie + bearer-token split)
 * but talks to hq-api instead, via the /api rewrite in next.config.mjs.
 *
 * The access token lives ONLY in this module-private variable — never in
 * localStorage, never on `window` — so an XSS payload running on the page
 * has no reference to reach it. See apps/web's copy for the full rationale.
 */
import type { HqPermission } from "./permissions";

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

export async function hqApi<T>(path: string, init: RequestInitLite = {}): Promise<T> {
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

/** Authenticated staff download (CSV export): triggers a browser save. Mirrors apps/web's staffApiDownload. */
export async function hqApiDownload(path: string, filenameFallback: string): Promise<void> {
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

export interface HqStaffUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "staff";
  permissions: HqPermission[];
  twoFactorEnabled?: boolean;
}

export type LoginResult =
  | { twoFactorRequired: true; challengeToken: string }
  | { twoFactorRequired?: false; staff: HqStaffUser };

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
    | { accessToken: string; staff: HqStaffUser };
  if ("twoFactorRequired" in data) return { twoFactorRequired: true, challengeToken: data.challengeToken };
  setToken(data.accessToken);
  return { staff: data.staff };
}

export async function verifyTwoFactor(challengeToken: string, code: string): Promise<HqStaffUser> {
  const res = await fetch("/api/auth/2fa/verify", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeToken, code }),
  });
  if (!res.ok) throw await toApiError(res);
  const data = (await res.json()) as { accessToken: string; staff: HqStaffUser };
  setToken(data.accessToken);
  return data.staff;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
  setToken(null);
}
