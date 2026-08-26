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

  // Contest titles live in ArenaContestCache's payload, not on
  // ArenaParticipation (no FK across the hq-api/apps-api boundary — see the
  // banner comment on ArenaParticipation) — batch-fetch once for the rating
  // graph's tooltip labels rather than joining per row.
  const contestIds = [...new Set(participations.map((p) => p.contestId))];
  const contestRows = contestIds.length
    ? await prisma.arenaContestCache.findMany({
        where: { contestId: { in: contestIds } },
        select: { contestId: true, payload: true },
      })
    : [];
  const contestTitles = new Map(
    contestRows.map((r) => [r.contestId, (r.payload as unknown as { title?: string }).title ?? "Contest"])
  );

  // Chronological (oldest first) for a rating-over-time line chart — the
  // contestHistory list below stays newest-first, that's a display list.
  const ratedHistory = participations
    .filter((p) => p.ratingAfter !== null && p.finishedAt !== null)
    .sort((a, b) => a.finishedAt!.getTime() - b.finishedAt!.getTime());

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
      contestTitle: contestTitles.get(p.contestId) ?? "Contest",
      score: p.score,
      rank: p.rank,
      ratingBefore: p.ratingBefore,
      ratingAfter: p.ratingAfter,
      finishedAt: p.finishedAt,
    })),
    ratingHistory: ratedHistory.map((p) => ({
      date: p.finishedAt!.toISOString(),
      contestTitle: contestTitles.get(p.contestId) ?? "Contest",
      rating: p.ratingAfter!,
      delta: p.ratingAfter! - (p.ratingBefore ?? p.ratingAfter!),
    })),
  };
}

const SUBMISSIONS_PAGE_SIZE = 25;

/** Paginated submission history (both contest and practice) for
 *  GET /api/arena/users/:handle/submissions?page=. */
export async function loadUserSubmissions(handle: string, page: number) {
  const user = await prisma.arenaUser.findUnique({ where: { handle }, select: { id: true } });
  if (!user) throw notFound("No Arena profile with that handle");

  const [submissions, total] = await Promise.all([
    prisma.arenaSubmission.findMany({
      where: { userId: user.id },
      include: { practiceProblem: { select: { title: true } } },
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * SUBMISSIONS_PAGE_SIZE,
      take: SUBMISSIONS_PAGE_SIZE,
    }),
    prisma.arenaSubmission.count({ where: { userId: user.id } }),
  ]);

  const contestIds = [...new Set(submissions.filter((s) => s.contestId).map((s) => s.contestId!))];
  const contestRows = contestIds.length
    ? await prisma.arenaContestCache.findMany({ where: { contestId: { in: contestIds } }, select: { contestId: true, payload: true } })
    : [];
  const contestPayloads = new Map(contestRows.map((r) => [r.contestId, r.payload as unknown as ContestSyncPayload]));

  function titleFor(s: (typeof submissions)[number]): string {
    if (s.mode === "practice") return s.practiceProblem?.title ?? "Practice problem";
    const payload = s.contestId ? contestPayloads.get(s.contestId) : undefined;
    const question = payload?.questions.find((q) => q.contestQuestionId === s.contestQuestionId);
    return question?.title ?? "Contest problem";
  }

  return {
    submissions: submissions.map((s) => ({
      id: s.id,
      mode: s.mode,
      problemTitle: titleFor(s),
      status: s.status,
      language: s.language,
      score: s.score,
      submittedAt: s.submittedAt,
    })),
    page,
    pageSize: SUBMISSIONS_PAGE_SIZE,
    total,
  };
}

interface ContestSyncPayload {
  questions: { contestQuestionId: string; title: string }[];
}

/** GitHub-style contribution calendar: one row per day with any ArenaActivity
 *  in the last 365 days, for GET /api/arena/users/:handle/heatmap. */
export async function loadActivityHeatmap(handle: string): Promise<{ date: string; count: number }[]> {
  const user = await prisma.arenaUser.findUnique({ where: { handle }, select: { id: true } });
  if (!user) throw notFound("No Arena profile with that handle");

  const rows = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
    FROM "ArenaActivity"
    WHERE "userId" = ${user.id} AND "createdAt" >= NOW() - INTERVAL '365 days'
    GROUP BY day
    ORDER BY day ASC
  `;
  return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
}
