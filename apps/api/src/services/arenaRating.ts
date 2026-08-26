import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { awardBadgesForContestResult } from "./arenaBadges";
import { gradeAllMcqs } from "./arenaGrading";
import { syncResultsToHq, type ArenaStanding } from "./arenaHqSync";

/**
 * Elo-lite rating update, computed once per contest after it ends (see
 * jobs/queues.ts's enqueueArenaRatingComputation). A deliberate v1 default
 * (see plan's "Decisions made without re-asking the user" #2) — no existing
 * rating precedent anywhere in this codebase to defer to instead, and this
 * is a standard, well-understood formula (Codeforces uses a close variant).
 * Tunable later without a schema change.
 */
function kFactor(rating: number): number {
  return rating < 2100 ? 32 : 16;
}

function expectedScore(myRating: number, fieldAverage: number): number {
  return 1 / (1 + 10 ** ((fieldAverage - myRating) / 400));
}

export async function computeContestRatings(contestId: string): Promise<void> {
  // Idempotency guard: the contest sweep (services/arenaLifecycle.ts) keeps
  // matching any row with status "grading" on every 30s tick — once this
  // function has already flipped the cache to "completed" below, a second
  // call (a stale re-enqueue, or the job's dedup record expiring from
  // Redis) must be a no-op, or it would double-apply rating deltas and
  // re-award contest-result badges.
  const cache = await prisma.arenaContestCache.findUnique({ where: { contestId } });
  if (!cache || cache.status === "completed") {
    logger.info({ contestId }, "arena rating computation: already completed, skipping");
    return;
  }

  // MCQ verdicts are revealed for the first time here — must happen before
  // ranking below, since a still-"pending_review" MCQ hasn't contributed to
  // participation.score yet (see arenaSubmissions.routes.ts's deferred-
  // grading comment).
  await gradeAllMcqs(contestId);

  // "warned" (BUG-6 proctoring strikes) is still a completing participant,
  // not disqualified — must still be ranked and rated, same as
  // active/submitted, or a warned-but-not-DQ'd user silently vanishes from
  // final standings.
  const participations = await prisma.arenaParticipation.findMany({
    where: { contestId, status: { in: ["active", "submitted", "warned"] } },
    include: { user: true },
  });
  if (participations.length === 0) {
    // Still flip the cache to "completed" — an empty field shouldn't keep
    // the sweep re-matching this contest forever either.
    await prisma.arenaContestCache.update({ where: { contestId }, data: { status: "completed" } });
    logger.info({ contestId }, "arena rating computation: no participants, skipping");
    return;
  }

  // Rank by score desc (ties broken by earlier registration — a simple,
  // deterministic tiebreak; icpc_penalty mode's time-based tiebreak is
  // future work, see plan's open decisions).
  const ranked = [...participations].sort(
    (a, b) => b.score - a.score || a.registeredAt.getTime() - b.registeredAt.getTime()
  );

  const fieldAverage = Math.round(
    participations.reduce((sum, p) => sum + p.user.rating, 0) / participations.length
  );

  const standings: ArenaStanding[] = [];

  for (let i = 0; i < ranked.length; i++) {
    const p = ranked[i];
    const rank = i + 1;
    const ratingBefore = p.user.rating;
    // Actual performance: 1.0 for 1st place, scaled down toward 0 for last —
    // a simple linear placement score, standard for a single-round-robin
    // "everyone vs the field" Elo application.
    const actualScore = ranked.length === 1 ? 1 : 1 - (rank - 1) / (ranked.length - 1);
    // Proctor-to-Earn: p.ratingMultiplier (locked in when they chose a
    // proctoring level, see routes/arenaContests.routes.ts's
    // /proctoring-level) scales the delta symmetrically — a participant who
    // committed to lockdown-level monitoring earns more on a good
    // performance AND loses more on a bad one, so opting in is genuinely
    // higher-stakes rather than a one-way rating boost.
    const delta = Math.round(
      kFactor(ratingBefore) * p.ratingMultiplier * (actualScore - expectedScore(ratingBefore, fieldAverage))
    );
    const ratingAfter = Math.max(0, ratingBefore + delta);

    await prisma.$transaction([
      prisma.arenaParticipation.update({
        where: { id: p.id },
        data: { rank, status: "submitted", finishedAt: p.finishedAt ?? new Date(), ratingBefore, ratingAfter },
      }),
      prisma.arenaUser.update({
        where: { id: p.userId },
        data: { rating: ratingAfter, ratingUpdatedAt: new Date() },
      }),
      prisma.arenaActivity.create({
        data: {
          userId: p.userId,
          type: "rating_change",
          metadata: { contestId, rank, ratingBefore, ratingAfter, delta },
        },
      }),
    ]);

    await awardBadgesForContestResult(p.userId, contestId, rank, p.chosenProctoringLevel, ratingBefore, ratingAfter);

    standings.push({
      userId: p.userId,
      handle: p.user.handle,
      name: p.user.name,
      score: p.score,
      penaltyMs: p.penaltyMs.toString(),
      rank,
      ratingBefore,
      ratingAfter,
      chosenProctoringLevel: p.chosenProctoringLevel,
      aiFlags: p.aiFlags as Record<string, unknown>[],
      reviewStatus: p.reviewStatus,
    });
  }

  await prisma.arenaContestCache.update({ where: { contestId }, data: { status: "completed" } });
  syncResultsToHq(contestId, standings);
  logger.info({ contestId, participants: ranked.length }, "arena contest rating computation complete");
}
