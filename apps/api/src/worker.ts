/** Standalone queue-worker process (grading + session auto-submit). */
import "./instrument";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { startWorkers } from "./jobs/processors";

const workers = startWorkers();
logger.info("CodeForge worker process running");

const SHUTDOWN_DEADLINE_MS = 30_000;

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  // BullMQ's close() waits for in-flight jobs to finish; cap that wait so a
  // stuck job can't block the process from ever exiting on a redeploy.
  await Promise.race([
    workers.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_DEADLINE_MS)),
  ]);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
