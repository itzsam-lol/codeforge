import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/** Badge catalog is self-provisioning (upsert-on-first-award) rather than a
 *  separate seed step — matches this codebase's existing low-ceremony
 *  convention for small reference data (e.g. SEED_* env-driven org/admin
 *  creation) instead of adding a migration/seed-script dependency for a
 *  handful of rows that never change shape. */
const BADGE_CATALOG: Record<string, { name: string; description: string; iconKey: string }> = {
  first_blood: {
    name: "First Blood",
    description: "First to solve a problem in a contest",
    iconKey: "flame",
  },
  top_10_finish: {
    name: "Top 10 Finish",
    description: "Placed in the top 10 of a contest",
    iconKey: "trophy",
  },
  streak_7: {
    name: "7-Day Streak",
    description: "Solved at least one problem on 7 consecutive days",
    iconKey: "calendar-check",
  },
  verified_competitor: {
    name: "Verified Competitor",
    description: "Completed a contest with webcam or lockdown proctoring enabled",
    iconKey: "shield-check",
  },
  sentinel_survivor: {
    name: "Sentinel Survivor",
    description: "Completed a contest at full lockdown proctoring",
    iconKey: "shield",
  },
  contest_veteran: {
    name: "Contest Veteran",
    description: "Participated in 10+ contests",
    iconKey: "medal",
  },
  century_club: {
    name: "Century Club",
    description: "Reached a rating of 1400+",
    iconKey: "star",
  },
  master_class: {
    name: "Master Class",
    description: "Reached a rating of 1800+",
    iconKey: "crown",
  },
  problem_crusher: {
    name: "Problem Crusher",
    description: "Solved 50+ practice problems",
    iconKey: "hammer",
  },
  speed_demon: {
    name: "Speed Demon",
    description: "Solved a problem within 5 minutes of contest start",
    iconKey: "zap",
  },
  perfectionist: {
    name: "Perfectionist",
    description: "Achieved a perfect score in a contest — every question accepted",
    iconKey: "sparkles",
  },
  comeback_king: {
    name: "Comeback King",
    description: "Gained 100+ rating points in a single contest",
    iconKey: "trending-up",
  },
};

async function award(userId: string, key: keyof typeof BADGE_CATALOG, contextLabel?: string): Promise<void> {
  const def = BADGE_CATALOG[key];
  const badge = await prisma.arenaBadge.upsert({
    where: { key },
    create: { key, ...def },
    update: {},
  });
  try {
    await prisma.arenaUserBadge.create({ data: { userId, badgeId: badge.id, contextLabel } });
    await prisma.arenaActivity.create({
      data: { userId, type: "badge_earned", metadata: { key, contextLabel } },
    });
    logger.info({ userId, key }, "arena badge awarded");
  } catch {
    // Unique constraint on (userId, badgeId) — already has it, silently skip.
  }
}

interface ContestCachePayloadQuestions {
  questions: { contestQuestionId: string }[];
}

/** Called right after an ArenaSubmission is marked "accepted". Checks the
 *  submission-triggered badges: first_blood/speed_demon/perfectionist
 *  (contest mode only), problem_crusher (practice mode only), and streak_7
 *  (any mode, driven by ArenaActivity history). */
export async function awardBadgesForSubmission(userId: string, contestId: string | null): Promise<void> {
  if (contestId) {
    const priorAccepted = await prisma.arenaSubmission.count({
      where: { contestId, mode: "contest", status: "accepted", userId: { not: userId } },
    });
    if (priorAccepted === 0) {
      await award(userId, "first_blood", `Contest ${contestId}`);
    }

    const cache = await prisma.arenaContestCache.findUnique({ where: { contestId }, select: { startAt: true, payload: true } });
    if (cache) {
      // speed_demon: this user's earliest accepted submission in this
      // contest landed within 5 minutes of the contest's start.
      const firstAccepted = await prisma.arenaSubmission.findFirst({
        where: { contestId, mode: "contest", userId, status: "accepted" },
        orderBy: { submittedAt: "asc" },
        select: { submittedAt: true },
      });
      if (firstAccepted && firstAccepted.submittedAt.getTime() - cache.startAt.getTime() <= 5 * 60 * 1000) {
        await award(userId, "speed_demon", `Contest ${contestId}`);
      }

      // perfectionist: every question in the contest has an accepted
      // submission from this user.
      const payload = cache.payload as unknown as ContestCachePayloadQuestions;
      if (payload.questions.length > 0) {
        const acceptedRows = await prisma.arenaSubmission.findMany({
          where: { contestId, mode: "contest", userId, status: "accepted", contestQuestionId: { not: null } },
          select: { contestQuestionId: true },
          distinct: ["contestQuestionId"],
        });
        const acceptedIds = new Set(acceptedRows.map((r) => r.contestQuestionId));
        if (payload.questions.every((q) => acceptedIds.has(q.contestQuestionId))) {
          await award(userId, "perfectionist", `Contest ${contestId}`);
        }
      }
    }
  } else {
    // problem_crusher: 50+ distinct practice problems accepted.
    const solvedRows = await prisma.arenaSubmission.findMany({
      where: { userId, mode: "practice", status: "accepted" },
      select: { practiceProblemId: true },
      distinct: ["practiceProblemId"],
    });
    if (solvedRows.length >= 50) {
      await award(userId, "problem_crusher");
    }
  }
  await checkStreak(userId);
}

async function checkStreak(userId: string): Promise<void> {
  const streak = await currentStreak(userId);
  if (streak >= 7) await award(userId, "streak_7");
}

/** Current consecutive-day streak of accepted submissions, ending today (0
 *  if nothing was solved today, regardless of yesterday). Shared by the
 *  streak_7 badge check above and FEAT-18's public currentStreak field. */
export async function currentStreak(userId: string): Promise<number> {
  const recent = await prisma.arenaActivity.findMany({
    where: { userId, type: "submission_accepted" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { createdAt: true },
  });
  const days = new Set(recent.map((a) => a.createdAt.toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Called after arenaRating.ts finalizes a contest's standings. */
export async function awardBadgesForContestResult(
  userId: string,
  contestId: string,
  rank: number,
  chosenProctoringLevel: string,
  ratingBefore: number,
  ratingAfter: number
): Promise<void> {
  if (rank <= 10) await award(userId, "top_10_finish", `Contest ${contestId}, rank #${rank}`);
  if (chosenProctoringLevel === "webcam" || chosenProctoringLevel === "lockdown") {
    await award(userId, "verified_competitor", `Contest ${contestId}`);
  }
  if (chosenProctoringLevel === "lockdown") {
    await award(userId, "sentinel_survivor", `Contest ${contestId}`);
  }
  if (ratingAfter >= 1400) await award(userId, "century_club");
  if (ratingAfter >= 1800) await award(userId, "master_class");
  if (ratingAfter - ratingBefore >= 100) await award(userId, "comeback_king", `Contest ${contestId}`);

  const contestsCompleted = await prisma.arenaParticipation.count({
    where: { userId, status: "submitted" },
  });
  if (contestsCompleted >= 10) await award(userId, "contest_veteran");
}
