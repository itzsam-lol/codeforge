import { prisma } from "../lib/prisma";
import { config } from "../config";
import { enqueueArenaRatingComputation } from "../jobs/queues";
import { sendArenaContestReminderEmail } from "../lib/email";

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

/**
 * FEAT-12: "starts soon" email — sent once per contest (guarded by
 * reminderSentAt) to everyone still registered when the contest is within
 * an hour of starting. A single sweep pass rather than a per-user delayed
 * job (jobs/queues.ts's scheduleAutoSubmit pattern) since this only ever
 * needs contest-granularity, not per-registrant timing — one email batch
 * per contest is simpler and there's no per-user cancellation to handle
 * (unlike scheduleAutoSubmit, which a manual submit cancels).
 */
export async function sendDueArenaContestReminders(): Promise<number> {
  const now = new Date();
  const dueContests = await prisma.arenaContestCache.findMany({
    where: {
      status: "scheduled",
      startAt: { gt: now, lte: new Date(now.getTime() + 60 * 60_000) },
      reminderSentAt: null,
    },
  });
  let sent = 0;
  for (const row of dueContests) {
    const payload = row.payload as unknown as { title: string };
    const participations = await prisma.arenaParticipation.findMany({
      where: { contestId: row.contestId, status: "registered", isVirtual: false },
      include: { user: { select: { email: true, name: true } } },
    });
    for (const p of participations) {
      await sendArenaContestReminderEmail({
        to: p.user.email,
        name: p.user.name,
        contestTitle: payload.title,
        startAt: row.startAt,
        link: `${config.webOrigin}/arena/contests/${row.slug}`,
      });
      sent += 1;
    }
    // Marked sent even for a zero-registrant contest — there's nothing left
    // to remind, and re-checking it every sweep forever would be wasted work.
    await prisma.arenaContestCache.update({ where: { contestId: row.contestId }, data: { reminderSentAt: now } });
  }
  return sent;
}
