import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { sendDeploymentAlert } from "../lib/alerts";
import { notify } from "./notify";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

async function checkOne(target: { id: string; appDomain: string }): Promise<void> {
  const start = Date.now();
  let healthy = false;
  let detail: string | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(`https://${target.appDomain}/healthz`, { signal: controller.signal }).finally(() =>
      clearTimeout(timer)
    );
    healthy = res.ok;
    if (!res.ok) detail = `HTTP ${res.status}`;
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - start;

  const previous = await prisma.healthCheckLog.findFirst({
    where: { targetId: target.id },
    orderBy: { checkedAt: "desc" },
  });

  await prisma.healthCheckLog.create({
    data: { targetId: target.id, healthy, latencyMs, detail },
  });

  // Only write to the activity timeline on a state change, not every tick —
  // staff reading a client's history want to know when something changed,
  // not a health check confirming nothing did.
  if (previous && previous.healthy !== healthy) {
    const target_ = await prisma.provisioningTarget.findUnique({
      where: { id: target.id },
      select: { clientId: true, client: { select: { companyName: true } } },
    });
    if (target_) {
      await prisma.clientActivity.create({
        data: {
          clientId: target_.clientId,
          type: "system",
          body: healthy
            ? `Deployment is reachable again (${target.appDomain}).`
            : `Deployment became unreachable (${target.appDomain})${detail ? `: ${detail}` : ""}.`,
        },
      });
      await sendDeploymentAlert({
        companyName: target_.client.companyName,
        appDomain: target.appDomain,
        healthy,
        detail,
      }).catch((err) => logger.error({ err, targetId: target.id }, "deployment alert failed"));
      notify(
        "deployment_status",
        healthy ? `${target_.client.companyName} is back up` : `${target_.client.companyName} is unreachable`,
        `${target.appDomain}${detail ? `: ${detail}` : ""}`,
        `/clients/${target_.clientId}`
      );
    }
  }
}

async function pollAll(): Promise<void> {
  const targets = await prisma.provisioningTarget.findMany({ select: { id: true, appDomain: true } });
  for (const target of targets) {
    await checkOne(target).catch((err) => logger.error({ err, targetId: target.id }, "health check failed"));
  }
}

export function startHealthMonitor(): { stop: () => void } {
  const timer = setInterval(() => void pollAll(), POLL_INTERVAL_MS);
  void pollAll(); // first check immediately rather than waiting a full interval
  return { stop: () => clearInterval(timer) };
}
