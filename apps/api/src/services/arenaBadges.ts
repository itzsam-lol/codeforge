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

/** Called right after an ArenaSubmission is marked "accepted". Checks the
 *  submission-triggered badges: first_blood (contest mode only) and
 *  streak_7 (any mode, driven by ArenaActivity history). */
export async function awardBadgesForSubmission(userId: string, contestId: string | null): Promise<void> {
  if (contestId) {
    const priorAccepted = await prisma.arenaSubmission.count({
      where: { contestId, mode: "contest", status: "accepted", userId: { not: userId } },
    });
    if (priorAccepted === 0) {
      await award(userId, "first_blood", `Contest ${contestId}`);
    }
  }
  await checkStreak(userId);
}

async function checkStreak(userId: string): Promise<void> {
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
  if (streak >= 7) await award(userId, "streak_7");
}

/** Called after arenaRating.ts finalizes a contest's standings. */
export async function awardBadgesForContestResult(
  userId: string,
  contestId: string,
  rank: number,
  chosenProctoringLevel: string
): Promise<void> {
  if (rank <= 10) await award(userId, "top_10_finish", `Contest ${contestId}, rank #${rank}`);
  if (chosenProctoringLevel === "webcam" || chosenProctoringLevel === "lockdown") {
    await award(userId, "verified_competitor", `Contest ${contestId}`);
  }
  if (chosenProctoringLevel === "lockdown") {
    await award(userId, "sentinel_survivor", `Contest ${contestId}`);
  }
}
