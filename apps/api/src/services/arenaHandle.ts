import { prisma } from "../lib/prisma";

/** Slugifies a display name into a starting handle, then disambiguates
 *  against existing rows with a numeric suffix. Shared by email/password
 *  registration and OAuth account creation (routes/arenaAuth.routes.ts,
 *  routes/arenaOAuth.routes.ts) — same "best-effort slug, guaranteed
 *  unique" shape as apps/hq-api's Contest.slug generation. */
export async function generateUniqueHandleFor(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "player";
  let candidate = base;
  let suffix = 0;
  // Bounded by design: a random 4-digit suffix after a handful of
  // collisions makes an unbounded loop practically unreachable.
  while (await prisma.arenaUser.findUnique({ where: { handle: candidate } })) {
    suffix += 1;
    candidate = suffix < 20 ? `${base}-${suffix}` : `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return candidate;
}
