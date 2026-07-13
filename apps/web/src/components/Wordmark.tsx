"use client";

import { cn } from "@/components/ui";
import { LogoMark } from "@/components/LogoMark";
import type { PublicBranding } from "@/lib/branding";

/**
 * The one wordmark component every recruiter-side surface should use
 * (sidebar, mobile top bar, login page) so white-labeling a deployment is a
 * single code path: custom logo > custom name > the CodeForge default,
 * with `hideCodeForgeBranding` suppressing the default entirely.
 */
export function Wordmark({
  branding,
  size = "md",
}: {
  branding: PublicBranding;
  size?: "sm" | "md";
}) {
  const textSize = size === "sm" ? "text-base" : "text-lg";

  if (branding.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={branding.logoUrl}
        alt={branding.name}
        className={cn("max-w-[200px] object-contain", size === "sm" ? "h-8" : "h-10")}
      />
    );
  }
  if (branding.name !== "CodeForge") {
    return (
      <span
        className={cn(textSize, "font-semibold tracking-tight")}
        style={branding.accentColor ? { color: branding.accentColor } : undefined}
      >
        {branding.name}
      </span>
    );
  }
  if (branding.hideCodeForgeBranding) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "flex items-center justify-center rounded-md bg-accent text-white",
          size === "sm" ? "h-7 w-7" : "h-8 w-8"
        )}
      >
        <LogoMark size={size === "sm" ? 16 : 18} />
      </span>
      <span className={cn(textSize, "font-semibold tracking-tight text-on-surface")}>CodeForge</span>
    </span>
  );
}
