import Link from "next/link";
import { tierFor } from "@/lib/arenaTiers";
import { cn } from "@/lib/utils";

/**
 * A user's handle/name, colored by their rating tier — the same treatment
 * Codeforces uses. Links to their profile unless `linked` is false (e.g.
 * inside a row that's already a link, like the leaderboard's list items).
 */
export function TierHandle({
  handle,
  rating,
  name,
  linked = true,
  className,
}: {
  handle: string;
  rating: number;
  name?: string;
  linked?: boolean;
  className?: string;
}) {
  const [, , tierColor] = tierFor(rating);
  const label = name ?? handle;
  if (!linked) {
    return <span className={cn("font-medium", tierColor, className)}>{label}</span>;
  }
  return (
    <Link href={`/arena/profile/${handle}`} className={cn("font-medium hover:underline", tierColor, className)}>
      {label}
    </Link>
  );
}
