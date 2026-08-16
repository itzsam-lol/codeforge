import "./instrument";
import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { reconcileOrphanedRuns } from "./services/provisioning";
import { startHealthMonitor } from "./services/healthMonitor";
import { startRenewalReminder } from "./services/renewalReminder";

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, "CodeForge HQ API listening");
});

void reconcileOrphanedRuns();
const healthMonitor = startHealthMonitor();
const renewalReminder = startRenewalReminder();

const SHUTDOWN_DEADLINE_MS = 30_000;

function closeServer(): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  // Mirrors apps/api/src/index.ts: server.close()'s callback alone only
  // fires once every connection has drained, which could hang indefinitely
  // on a stuck request — race it against a hard deadline instead of the
  // previous fire-and-forget server.close() with no callback at all.
  await Promise.race([
    closeServer(),
    new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_DEADLINE_MS)),
  ]);
  healthMonitor.stop();
  renewalReminder.stop();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
