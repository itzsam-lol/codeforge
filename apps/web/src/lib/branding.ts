"use client";

import { useEffect, useState } from "react";

// `| null` accepted alongside `undefined` throughout: different API routes
// represent "unset" differently (JSON drops undefined keys; some routes
// explicitly send null), so callers shouldn't have to normalize either way.
export interface PublicBranding {
  name: string;
  tagline?: string | null;
  logoUrl?: string | null;
  logoDarkUrl?: string | null;
  faviconUrl?: string | null;
  accentColor?: string | null;
  accentColorHover?: string | null;
  hideCodeForgeBranding: boolean;
}

const DEFAULT_BRANDING: PublicBranding = { name: "CodeForge", hideCodeForgeBranding: false };

/** Pre-auth-safe org branding (login page chrome, dashboard sidebar wordmark). */
export function usePublicBranding(): PublicBranding {
  const [branding, setBranding] = useState<PublicBranding>(DEFAULT_BRANDING);

  useEffect(() => {
    fetch("/api/org/public")
      .then((r) => (r.ok ? r.json() : DEFAULT_BRANDING))
      .then(setBranding)
      .catch(() => undefined);
  }, []);

  return branding;
}
