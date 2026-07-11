import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { startWorkers } from "./jobs/processors";

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, "CodeForge API listening");
});

let workers: { close: () => Promise<void> } | null = null;
if (config.workerInline) {
  workers = startWorkers();
} else {
  logger.info("WORKER_INLINE=false — run queue workers separately (npm run dev:worker)");
}

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close();
  if (workers) await workers.close().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
