export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtScore(score: number | null | undefined, max?: number): string {
  if (score == null) return "-";
  const s = Math.round(score * 100) / 100;
  return max != null ? `${s} / ${max}` : String(s);
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TYPE_COLORS: Record<string, "indigo" | "blue" | "green" | "amber" | "red" | "slate"> = {
  dsa: "indigo",
  mcq: "blue",
  frontend_ui: "green",
  api_challenge: "amber",
  bug_fix: "red",
  repo_project: "slate",
};

export function typeBadgeColor(type: string) {
  return TYPE_COLORS[type] ?? "slate";
}

// Continuous red -> amber -> green ramp, no threshold cliff: a 58 and a 62
// read as neighbours instead of a fail/pass jump at some arbitrary cutoff.
// Matches the design spec's "Integrity score reads as a continuous ramp".
//
// Built from CSS color-mix() over the --color-bad/-warn/-ok custom
// properties rather than hardcoded RGB triples: those tokens have different
// values in [data-theme="recruiter-dark"] (see globals.css), and a fixed
// JS-computed RGB string can't follow that swap — it stayed pinned to the
// light-theme palette and clashed with a dark background. color-mix() is
// resolved by the browser against whichever theme is active at the point
// of use, so this needs no theme detection here (same fix shape as
// AnalyticsTab.tsx's chart-color color-mix).
export function integrityScoreColor(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  if (s <= 50) {
    const t = Math.round((s / 50) * 100);
    return `color-mix(in srgb, var(--color-warn) ${t}%, var(--color-bad) ${100 - t}%)`;
  }
  const t = Math.round(((s - 50) / 50) * 100);
  return `color-mix(in srgb, var(--color-ok) ${t}%, var(--color-warn) ${100 - t}%)`;
}
