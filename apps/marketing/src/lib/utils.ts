import { twMerge } from "tailwind-merge";

/** Tailwind-aware merge, not a plain join - a caller's own utility must win
 *  over a conflicting one baked into a component's base class, which a
 *  plain string join can't guarantee (Tailwind's generated CSS order, not
 *  argument order, decides which one applies). */
export function cn(...parts: (string | false | null | undefined)[]) {
  return twMerge(parts.filter(Boolean).join(" "));
}
