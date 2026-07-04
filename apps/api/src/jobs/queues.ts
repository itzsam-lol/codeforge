import { Queue, type ConnectionOptions } from "bullmq";
import { config } from "../config";

/**
 * BullMQ connection options parsed from REDIS_URL. We hand BullMQ options
 * (not a client instance) so it manages its own connections — including the
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

/** Repeatable sweep — catches sessions whose delayed job was lost (e.g. Redis flush). */
export async function ensureSweepJob(): Promise<void> {
  await sessionQueue.add(
    "sweep",
    {},
    { repeat: { every: 60_000 }, jobId: "session-sweep" }
  );
}
