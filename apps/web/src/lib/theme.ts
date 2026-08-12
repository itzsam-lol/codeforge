"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";
const STORAGE_KEY = "cf_theme";

/**
 * Recruiter-dashboard light/dark preference, independent of the candidate
 * flow's fixed dark theme (data-theme="candidate" is a distinct brand mode,
 * not an OS-preference toggle — see globals.css). Defaults to light,
 * persisted per-browser like the dashboard's other display preferences
 * (apps/web/src/app/(dash)/dashboard/page.tsx's card order/visibility).
 */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") setMode(stored);
  }, []);

  function set(next: ThemeMode) {
    setMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return [mode, set];
}
