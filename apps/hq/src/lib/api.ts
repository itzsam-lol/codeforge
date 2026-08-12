/**
 * Browser-side API client for HQ. Mirrors apps/web/src/lib/api.ts's shape
 * (same refresh-retry pattern, same httpOnly-cookie + bearer-token split)
 * but talks to hq-api instead, via the /api rewrite in next.config.mjs.
 */
import type { HqPermission } from "./permissions";

const TOKEN_KEY = "hq_access_token";
let memToken: string | null = null;

export function getToken(): string | null {
  if (memToken) return memToken;
  if (typeof window === "undefined") return null;
  memToken = window.localStorage.getItem(TOKEN_KEY);
  return memToken;
}

export function setToken(token: string | null) {
  memToken = token;
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
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

export interface HqStaffUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "staff";
  permissions: HqPermission[];
}

export async function login(email: string, password: string): Promise<HqStaffUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
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
