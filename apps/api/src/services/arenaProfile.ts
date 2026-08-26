import type { ArenaUser } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";

/** Shape returned to the account owner (auth responses, GET /me) — includes
 *  email, which a public profile view must never expose. */
export function arenaSelfView(user: ArenaUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    country: user.country,
    rating: user.rating,
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt,
  };
}

/** Shape returned by GET /api/arena/users/:handle — no email, no auth
 *  internals (lockedUntil, failedLoginAttempts, etc). */
export function arenaPublicSummary(user: ArenaUser) {
  return {
    handle: user.handle,
    name: user.name,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    country: user.country,
    rating: user.rating,
    createdAt: user.createdAt,
  };
}

/** Full public profile: summary + badges + recent activity + contest
 *  history, the data GET /api/arena/users/:handle actually serves. */
export async function loadPublicProfile(handle: string) {
  const user = await prisma.arenaUser.findUnique({ where: { handle } });
  if (!user) throw notFound("No Arena profile with that handle");

  const [userBadges, activity, participations, solvedCount] = await Promise.all([
    prisma.arenaUserBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
      orderBy: { awardedAt: "desc" },
    }),
    prisma.arenaActivity.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.arenaParticipation.findMany({
      where: { userId: user.id, status: { in: ["submitted", "disqualified"] } },
      orderBy: { finishedAt: "desc" },
      take: 50,
    }),
    prisma.arenaSubmission.count({
      where: { userId: user.id, status: "accepted", mode: "practice" },
    }),
  ]);

  return {
    ...arenaPublicSummary(user),
    stats: {
      totalContests: participations.length,
      practiceSolved: solvedCount,
    },
    badges: userBadges.map((ub) => ({
      key: ub.badge.key,
      name: ub.badge.name,
      description: ub.badge.description,
      iconKey: ub.badge.iconKey,
      awardedAt: ub.awardedAt,
      contextLabel: ub.contextLabel,
    })),
    activity: activity.map((a) => ({ type: a.type, metadata: a.metadata, createdAt: a.createdAt })),
    contestHistory: participations.map((p) => ({
      contestId: p.contestId,
      score: p.score,
      rank: p.rank,
      ratingBefore: p.ratingBefore,
      ratingAfter: p.ratingAfter,
      finishedAt: p.finishedAt,
    })),
  };
}
