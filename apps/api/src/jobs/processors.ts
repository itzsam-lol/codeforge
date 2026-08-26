import { Worker } from "bullmq";
import * as Sentry from "@sentry/node";
import { logger } from "../lib/logger";
import { gradeSubmission } from "../services/grading";
import { finalizeSession, sweepExpiredSessions, publishScheduledTests } from "../services/session";
import { scanSession, scanTest } from "../services/plagiarism";
import { sendDueReminders } from "../services/notifications";
import { purgeExpiredSnapshots } from "../services/retention";
import { checkSentinelHeartbeats } from "../services/sentinel";
import { gradeArenaSubmission } from "../services/arenaGrading";
import { analyzeArenaSnapshot } from "../services/arenaVision";
import { sweepArenaContests } from "../services/arenaLifecycle";
import { computeContestRatings } from "../services/arenaRating";
import {
  ensureArenaContestSweepJob,
  ensurePublishSweepJob,
  ensureReminderJob,
  ensureRetentionJob,
  ensureSentinelHeartbeatSweepJob,
  ensureSweepJob,
  redisConnection,
} from "./queues";

/**
 * Queue processors. Run inside the API process when WORKER_INLINE=true (dev),
 * or as a dedicated process via `npm run dev:worker` / the compose `worker`
 * service. Stateless by design so more workers can be added horizontally.
 */
export function startWorkers(): { close: () => Promise<void> } {
  const gradeWorker = new Worker(
    "grade",
    async (job) => {
      if (job.name === "grade-submission") {
        await gradeSubmission(job.data.submissionId as string);
      } else if (job.name === "grade-arena-submission") {
        await gradeArenaSubmission(job.data.submissionId as string);
      } else if (job.name === "analyze-arena-snapshot") {
        await analyzeArenaSnapshot(job.data.participationId as string, job.data.key as string);
      } else if (job.name === "render-reference") {
        const { renderReferenceScreenshots } = await import("../services/appdev/frontendGrading");
        await renderReferenceScreenshots(job.data.questionId as string);
      }
    },
    // Phase 3 graders launch browsers/containers, keep parallelism modest.
    { connection: redisConnection, concurrency: 2 }
  );

  const sessionWorker = new Worker(
    "session",
    async (job) => {
      if (job.name === "auto-submit") {
        await finalizeSession(job.data.sessionId as string, "auto");
      } else if (job.name === "sweep") {
        const n = await sweepExpiredSessions();
        if (n > 0) logger.info({ finalized: n }, "sweep auto-submitted expired sessions");
      } else if (job.name === "send-reminders") {
        const n = await sendDueReminders();
        if (n > 0) logger.info({ sent: n }, "sent expiry-reminder emails");
      } else if (job.name === "purge-snapshots") {
        const n = await purgeExpiredSnapshots();
        if (n > 0) logger.info({ purged: n }, "purged expired proctoring snapshots");
      } else if (job.name === "publish-scheduled-tests") {
        const n = await publishScheduledTests();
        if (n > 0) logger.info({ published: n }, "auto-published scheduled tests");
      } else if (job.name === "sentinel-heartbeat-sweep") {
        const n = await checkSentinelHeartbeats();
        if (n > 0) logger.info({ flagged: n }, "flagged sessions with a lost Sentinel heartbeat");
      } else if (job.name === "arena-contest-sweep") {
        const n = await sweepArenaContests();
        if (n > 0) logger.info({ swept: n }, "swept ended arena contests into rating computation");
      } else if (job.name === "arena-rating-computation") {
        await computeContestRatings(job.data.contestId as string);
      }
    },
    { connection: redisConnection, concurrency: 2 }
  );

  const plagiarismWorker = new Worker(
    "plagiarism",
    async (job) => {
      if (job.name === "scan-session") {
        await scanSession(job.data.sessionId as string);
      } else if (job.name === "scan-test") {
        await scanTest(job.data.testId as string);
      }
    },
    { connection: redisConnection, concurrency: 1 }
  );

  for (const w of [gradeWorker, sessionWorker, plagiarismWorker]) {
    w.on("failed", (job, err) => {
      logger.error({ jobId: job?.id, name: job?.name, err: err.message }, "job failed");
      // BullMQ fires "failed" after every attempt, not just the last one —
      // most are just a mid-retry blip (already logged above) and would be
      // noise in error tracking. Only report once retries are actually
      // exhausted (removeOnFail: 5_000 keeps it in Redis as a de facto
      // dead-letter queue either way, but nothing was ever surfacing that a
      // job landed there permanently until someone thought to go look).
      const attempts = job?.opts.attempts ?? 1;
      if (job && job.attemptsMade >= attempts) {
        Sentry.captureException(err, {
          tags: { queue: w.name, jobName: job.name },
          extra: { jobId: job.id, attemptsMade: job.attemptsMade, data: job.data },
        });
      }
    });
    w.on("error", (err) => {
      logger.error({ err }, "worker error");
      Sentry.captureException(err, { tags: { queue: w.name } });
    });
  }

  ensureSweepJob().catch((err) => logger.error({ err }, "failed to register sweep job"));
  ensureReminderJob().catch((err) => logger.error({ err }, "failed to register reminder job"));
  ensureRetentionJob().catch((err) => logger.error({ err }, "failed to register retention job"));
  ensurePublishSweepJob().catch((err) => logger.error({ err }, "failed to register publish-sweep job"));
  ensureSentinelHeartbeatSweepJob().catch((err) =>
    logger.error({ err }, "failed to register sentinel-heartbeat-sweep job")
  );
  ensureArenaContestSweepJob().catch((err) => logger.error({ err }, "failed to register arena-contest-sweep job"));

  logger.info("queue workers started (grade, session, plagiarism)");
  return {
    close: async () => {
      await Promise.all([gradeWorker.close(), sessionWorker.close(), plagiarismWorker.close()]);
    },
  };
}
