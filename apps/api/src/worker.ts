/** Standalone queue-worker process (grading + session auto-submit). */
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { startWorkers } from "./jobs/processors";

const workers = startWorkers();
logger.info("CodeForge worker process running");

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  await workers.close().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
