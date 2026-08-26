import { prisma } from "../lib/prisma";
import { enqueueArenaRatingComputation } from "../jobs/queues";

/**
 * Safety-net sweep (jobs/queues.ts's ensureArenaContestSweepJob): hq-api's
 * own contest lifecycle service (services/contestLifecycle.ts, a
 * setInterval sweep) is what normally pushes a contest to "grading" via the
 * sync endpoint once its endAt passes. This is the redundant path in case
 * that push is delayed or HQ is briefly unreachable — enqueueing rating
 * computation is idempotent (deterministic jobId), so it's safe for both
 * paths to trigger it.
 */
export async function sweepArenaContests(): Promise<number> {
  const stale = await prisma.arenaContestCache.findMany({
    where: {
      OR: [
        // Natural end-of-window, in case hq-api's own push was delayed.
        { status: "live", endAt: { lt: new Date() } },
        // Already in "grading" regardless of endAt — covers a staff member
        // manually ending a contest early (hq-api's POST /:id/end), which
        // reaches this status well before its original endAt passes.
        { status: "grading" },
      ],
    },
  });
  for (const row of stale) {
    await enqueueArenaRatingComputation(row.contestId);
  }
  return stale.length;
}
