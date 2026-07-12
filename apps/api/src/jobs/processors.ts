import { Worker } from "bullmq";
import { logger } from "../lib/logger";
import { gradeSubmission } from "../services/grading";
import { finalizeSession, sweepExpiredSessions } from "../services/session";
import { scanSession, scanTest } from "../services/plagiarism";
import { sendDueReminders } from "../services/notifications";
import { purgeExpiredSnapshots } from "../services/retention";
import { ensureReminderJob, ensureRetentionJob, ensureSweepJob, redisConnection } from "./queues";

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
    w.on("failed", (job, err) =>
      logger.error({ jobId: job?.id, name: job?.name, err: err.message }, "job failed")
    );
    w.on("error", (err) => logger.error({ err }, "worker error"));
  }

  ensureSweepJob().catch((err) => logger.error({ err }, "failed to register sweep job"));
  ensureReminderJob().catch((err) => logger.error({ err }, "failed to register reminder job"));
  ensureRetentionJob().catch((err) => logger.error({ err }, "failed to register retention job"));

  logger.info("queue workers started (grade, session, plagiarism)");
  return {
    close: async () => {
      await Promise.all([gradeWorker.close(), sessionWorker.close(), plagiarismWorker.close()]);
    },
  };
}
