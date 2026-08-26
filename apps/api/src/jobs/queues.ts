import { Queue, type ConnectionOptions } from "bullmq";
import { config } from "../config";

/**
 * BullMQ connection options parsed from REDIS_URL. We hand BullMQ options
 * (not a client instance) so it manages its own connections, including the
 * dedicated blocking connections its workers require.
 */
function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.password ? { password: u.password } : {}),
    ...(u.username ? { username: u.username } : {}),
    ...(u.pathname && u.pathname !== "/" ? { db: Number(u.pathname.slice(1)) } : {}),
    // Required by BullMQ workers.
    maxRetriesPerRequest: null,
  };
}

export const redisConnection: ConnectionOptions = parseRedisUrl(config.redisUrl);

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
} as const;

export const gradeQueue = new Queue("grade", {
  connection: redisConnection,
  defaultJobOptions,
});

export const sessionQueue = new Queue("session", {
  connection: redisConnection,
  defaultJobOptions,
});

export const plagiarismQueue = new Queue("plagiarism", {
  connection: redisConnection,
  defaultJobOptions,
});

/** Async scan after a session finalizes (spec 3.6: runs after each submission). */
export async function enqueueScanSession(sessionId: string): Promise<void> {
  await plagiarismQueue.add("scan-session", { sessionId });
}

/** Recruiter-triggered full re-scan of a test's cohort. */
export async function enqueueScanTest(testId: string): Promise<void> {
  await plagiarismQueue.add("scan-test", { testId }, { jobId: `scan-test-${testId}-${Date.now()}` });
}

export async function enqueueGradeSubmission(submissionId: string): Promise<void> {
  await gradeQueue.add("grade-submission", { submissionId });
}

/** Arena submissions reuse the existing "grade" queue/worker rather than a
 *  parallel BullMQ setup for identical Judge0-backed work (no dedicated
 *  Arena throttling layer, per the locked-down build scope) — just a
 *  distinct job name so processors.ts can dispatch to gradeArenaSubmission. */
export async function enqueueGradeArenaSubmission(submissionId: string): Promise<void> {
  await gradeQueue.add("grade-arena-submission", { submissionId });
}

/** Cloud Vision analysis of a just-uploaded proctoring snapshot — enqueued
 *  rather than run inline so the upload request stays fast. Shares the
 *  "grade" queue for the same reason grade-arena-submission does (identical
 *  external-API-call shape, no need for parallel BullMQ infra). */
export async function enqueueAnalyzeArenaSnapshot(participationId: string, key: string): Promise<void> {
  await gradeQueue.add("analyze-arena-snapshot", { participationId, key });
}

/**
 * Server-side auto-submit at the session deadline (spec 3.4.7): a delayed job,
 * not a client timer. A deterministic jobId lets manual submission cancel it.
 * (BullMQ forbids ":" in custom job ids, hence the "-" separator.)
 */
const autoSubmitJobId = (sessionId: string) => `autosubmit-${sessionId}`;

export async function scheduleAutoSubmit(sessionId: string, endsAt: Date): Promise<void> {
  await sessionQueue.add(
    "auto-submit",
    { sessionId },
    {
      delay: Math.max(0, endsAt.getTime() - Date.now() + 3_000),
      jobId: autoSubmitJobId(sessionId),
    }
  );
}

export async function cancelAutoSubmit(sessionId: string): Promise<void> {
  try {
    const job = await sessionQueue.getJob(autoSubmitJobId(sessionId));
    if (job) await job.remove();
  } catch {
    // job may be mid-execution; finalizeSession is idempotent either way
  }
}

/** Repeatable sweep: catches sessions whose delayed job was lost (e.g. Redis flush). */
export async function ensureSweepJob(): Promise<void> {
  await sessionQueue.add(
    "sweep",
    {},
    { repeat: { every: 60_000 }, jobId: "session-sweep" }
  );
}

/** Repeatable sweep: sends the 24h-before-expiry candidate reminder (spec 3.9). */
export async function ensureReminderJob(): Promise<void> {
  await sessionQueue.add(
    "send-reminders",
    {},
    { repeat: { every: 15 * 60_000 }, jobId: "invitation-reminders" }
  );
}

/** Repeatable sweep: purges webcam/identity snapshots past retention (spec 8). */
export async function ensureRetentionJob(): Promise<void> {
  await sessionQueue.add(
    "purge-snapshots",
    {},
    { repeat: { every: 24 * 60 * 60_000 }, jobId: "snapshot-retention" }
  );
}

/** Repeatable sweep: auto-publishes draft tests whose scheduling window opened. */
export async function ensurePublishSweepJob(): Promise<void> {
  await sessionQueue.add(
    "publish-scheduled-tests",
    {},
    { repeat: { every: 60_000 }, jobId: "publish-scheduled-tests" }
  );
}

/** Repeatable sweep: flags sessions whose CodeForge Sentinel heartbeat has gone stale. */
export async function ensureSentinelHeartbeatSweepJob(): Promise<void> {
  await sessionQueue.add(
    "sentinel-heartbeat-sweep",
    {},
    { repeat: { every: 30_000 }, jobId: "sentinel-heartbeat-sweep" }
  );
}

/** Repeatable sweep: flips ArenaContestCache rows from "live"/"grading" past
 *  their endAt into rating computation — catches the transition even if
 *  hq-api's own lifecycle push (services/contestLifecycle.ts) is delayed or
 *  briefly unreachable. */
export async function ensureArenaContestSweepJob(): Promise<void> {
  await sessionQueue.add(
    "arena-contest-sweep",
    {},
    { repeat: { every: 30_000 }, jobId: "arena-contest-sweep" }
  );
}

/** Repeatable sweep: sends the "starts soon" arena contest reminder email
 *  (FEAT-12, services/arenaLifecycle.ts's sendDueArenaContestReminders). */
export async function ensureArenaReminderSweepJob(): Promise<void> {
  await sessionQueue.add(
    "arena-contest-reminder-sweep",
    {},
    { repeat: { every: 5 * 60_000 }, jobId: "arena-contest-reminder-sweep" }
  );
}

/** One-shot, deterministic jobId so re-triggering the sweep before the
 *  previous run finishes doesn't double-schedule the same contest. */
export async function enqueueArenaRatingComputation(contestId: string): Promise<void> {
  await sessionQueue.add(
    "arena-rating-computation",
    { contestId },
    { jobId: `arena-rating-${contestId}` }
  );
}
