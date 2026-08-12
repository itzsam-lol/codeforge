export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Coarse "Browser on OS" label for a session's device list — not a full UA
 *  parser, just enough to be more useful than the raw string. */
export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const os = /windows/i.test(userAgent)
    ? "Windows"
    : /mac os x/i.test(userAgent)
      ? "macOS"
      : /android/i.test(userAgent)
        ? "Android"
        : /iphone|ipad/i.test(userAgent)
          ? "iOS"
          : /linux/i.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  const browser = /edg\//i.test(userAgent)
    ? "Edge"
    : /chrome\//i.test(userAgent)
      ? "Chrome"
      : /firefox\//i.test(userAgent)
        ? "Firefox"
        : /safari\//i.test(userAgent)
          ? "Safari"
          : "Unknown browser";
  return `${browser} on ${os}`;
}
