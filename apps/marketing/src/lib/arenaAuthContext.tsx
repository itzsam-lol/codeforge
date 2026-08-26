"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { arenaApi, arenaLogout, getArenaToken, setArenaToken, type ArenaUser } from "./arenaApi";

interface ArenaAuthContextValue {
  user: ArenaUser | null;
  loading: boolean;
  setUser: (u: ArenaUser | null) => void;
  logout: () => Promise<void>;
}

const ArenaAuthContext = createContext<ArenaAuthContextValue | null>(null);

/**
 * Wraps every /arena page (see app/arena/layout.tsx). The access token lives
 * only in memory (arenaApi.ts's module-private variable), so a full page
 * reload always starts with none — this silently tries the httpOnly
 * refresh cookie once on mount to restore a session, same as apps/web's
 * (dash)/layout.tsx does for staff.
 */
export function ArenaAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ArenaUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getArenaToken()) {
        try {
          const res = await fetch("/api/arena/auth/refresh", { method: "POST", credentials: "include" });
          if (res.ok) {
            const data = (await res.json()) as { accessToken: string; user: ArenaUser };
            setArenaToken(data.accessToken);
            if (!cancelled) setUser(data.user);
          }
        } catch {
          // No session to restore — stays logged out, not an error state.
        }
      } else {
        try {
          const data = await arenaApi<{ user: ArenaUser }>("/api/arena/me");
          if (!cancelled) setUser(data.user);
        } catch {
          setArenaToken(null);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await arenaLogout();
    setUser(null);
  }, []);

  return (
    <ArenaAuthContext.Provider value={{ user, loading, setUser, logout }}>{children}</ArenaAuthContext.Provider>
  );
}

export function useArenaAuth(): ArenaAuthContextValue {
  const ctx = useContext(ArenaAuthContext);
  if (!ctx) throw new Error("useArenaAuth must be used within ArenaAuthProvider");
  return ctx;
}
