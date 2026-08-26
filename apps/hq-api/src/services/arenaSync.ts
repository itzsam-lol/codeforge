import { prisma } from "../lib/prisma";
import { config } from "../config";
import { logger } from "../lib/logger";
import type { Contest, ContestQuestion } from "../generated/prisma";

/**
 * Forward leg of the HQ<->apps/api contest sync: pushes a contest's full
 * content to apps/api whenever it's published, goes live, or ends. Mirrors
 * apps/api's services/support.ts syncNewTicketToHq exactly in posture — a
 * fire-and-forget fetch, catch-and-log, never thrown back to the caller —
 * but this direction is new to the codebase (every other cross-service sync
 * flows client-deployment -> HQ), so syncStatus/syncedAt/syncError are
 * persisted on Contest itself (unlike the fire-and-forget precedent) so
 * staff can see and retry a failed push from the contest detail page,
 * rather than a failure disappearing into a log line only an operator would
 * ever see.
 */
export async function syncContestToArena(
  contest: Contest & { questions: ContestQuestion[] }
): Promise<void> {
  const payload = {
    contestId: contest.id,
    slug: contest.slug,
    title: contest.title,
    description: contest.description,
    status: contest.status,
    scoringMode: contest.scoringMode,
    proctoringLevel: contest.proctoringLevel,
    webcamRequired: contest.webcamRequired,
    fullscreenRequired: contest.fullscreenRequired,
    // Proctor-to-Earn bonus config — apps/api needs these to compute each
    // participant's ratingMultiplier when they lock in a proctoring level.
    webcamBonusPct: contest.webcamBonusPct,
    lockdownBonusPct: contest.lockdownBonusPct,
    maxStrikes: contest.maxStrikes,
    startAt: contest.startAt.toISOString(),
    endAt: contest.endAt.toISOString(),
    questions: contest.questions
      .sort((a, b) => a.seq - b.seq)
      .map((q) => ({
        contestQuestionId: q.id,
        seq: q.seq,
        type: q.type,
        title: q.title,
        bodyMd: q.bodyMd,
        difficulty: q.difficulty,
        points: q.points,
        typeConfig: q.typeConfig,
        editorial: q.editorial,
      })),
  };

  try {
    const res = await fetch(`${config.arenaApiUrl}/api/arena/contests/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-arena-sync-secret": config.arenaSyncSecret },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`apps/api responded ${res.status}`);
    await prisma.contest.update({
      where: { id: contest.id },
      data: { syncStatus: "synced", syncedAt: new Date(), syncError: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, contestId: contest.id }, "[arena] contest sync to apps/api failed");
    await prisma.contest.update({
      where: { id: contest.id },
      data: { syncStatus: "failed", syncError: message },
    });
  }
}
