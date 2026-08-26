import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { syncContestToArena } from "./arenaSync";

// A contest window is measured in minutes, not days — much finer-grained
// than renewalReminder.ts's daily poll, closer to healthMonitor.ts's cadence.
const POLL_INTERVAL_MS = 30_000;

async function pollAll(): Promise<void> {
  const now = new Date();

  const toGoLive = await prisma.contest.findMany({
    where: { status: "scheduled", startAt: { lte: now } },
    include: { questions: { orderBy: { seq: "asc" } } },
  });
  for (const contest of toGoLive) {
    const updated = await prisma.contest.update({
      where: { id: contest.id },
      data: { status: "live", syncStatus: "pending" },
    });
    await syncContestToArena({ ...updated, questions: contest.questions });
    logger.info({ contestId: contest.id }, "contest auto-started");
  }

  const toGrade = await prisma.contest.findMany({
    where: { status: "live", endAt: { lte: now } },
    include: { questions: { orderBy: { seq: "asc" } } },
  });
  for (const contest of toGrade) {
    const updated = await prisma.contest.update({
      where: { id: contest.id },
      data: { status: "grading", syncStatus: "pending" },
    });
    await syncContestToArena({ ...updated, questions: contest.questions });
    logger.info({ contestId: contest.id }, "contest auto-ended, grading");
  }
}

export function startContestLifecycle(): { stop: () => void } {
  const timer = setInterval(() => void pollAll().catch((err) => logger.error({ err }, "contest lifecycle sweep failed")), POLL_INTERVAL_MS);
  void pollAll().catch((err) => logger.error({ err }, "contest lifecycle sweep failed"));
  return { stop: () => clearInterval(timer) };
}
