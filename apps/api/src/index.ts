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
  logger.info("WORKER_INLINE=false: run queue workers separately (npm run dev:worker)");
}

const SHUTDOWN_DEADLINE_MS = 30_000;

function closeServer(): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  // Stop accepting new connections, then give in-flight requests up to
  // SHUTDOWN_DEADLINE_MS to finish before forcing the rest of the sequence —
  // server.close()'s callback alone only fires once every connection has
  // already drained, which could hang indefinitely on a stuck request.
  await Promise.race([
    closeServer(),
    new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_DEADLINE_MS)),
  ]);
  if (workers) await workers.close().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
