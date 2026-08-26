import { cn } from "@/lib/utils";

/** Shimmer placeholder for loading states — replaces plain "Loading…" text
 *  across the Arena pages. Compose with explicit width/height utility
 *  classes at each call site. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-white/10", className)} />;
}
