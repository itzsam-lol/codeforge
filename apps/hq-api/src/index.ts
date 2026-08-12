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

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close();
  healthMonitor.stop();
  renewalReminder.stop();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
