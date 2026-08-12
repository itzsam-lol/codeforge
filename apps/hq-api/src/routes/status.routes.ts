import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/errors";

/**
 * Public, unauthenticated by design — a client-facing status page. Careful
 * to return only what a status page should show (company name, up/down,
 * uptime %, a day-by-day history) and never anything provisioning-internal
 * (host, appDomain, SSH details, raw error text that could leak infra info).
 */
export const statusRouter = Router();

const DAYS = 90;

statusRouter.get(
  "/:clientId",
  asyncHandler(async (req: Request, res: Response) => {
    const client = await prisma.client.findUnique({
      where: { id: req.params.clientId },
      select: { companyName: true, provisioningTarget: { select: { id: true } } },
    });
    if (!client || !client.provisioningTarget) throw notFound("No status page for this client");

    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
    const logs = await prisma.healthCheckLog.findMany({
      where: { targetId: client.provisioningTarget.id, checkedAt: { gte: since } },
      select: { healthy: true, checkedAt: true },
      orderBy: { checkedAt: "asc" },
    });

    const latest = logs[logs.length - 1] ?? null;

    // Bucket into calendar days: a day is "down" if any check that day
    // failed, "up" if all checks passed, "unknown" if no data.
    const byDay = new Map<string, boolean[]>();
    for (const log of logs) {
      const day = log.checkedAt.toISOString().slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(log.healthy);
    }
    const days: { date: string; status: "up" | "down" | "unknown" }[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const checks = byDay.get(d);
      days.push({
        date: d,
        status: !checks || checks.length === 0 ? "unknown" : checks.every(Boolean) ? "up" : "down",
      });
    }

    const uptimePercent30d =
      logs.length === 0
        ? null
        : Math.round(
            (logs.filter((l) => l.checkedAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) && l.healthy).length /
              Math.max(1, logs.filter((l) => l.checkedAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length)) *
              1000
          ) / 10;

    res.json({
      companyName: client.companyName,
      healthy: latest?.healthy ?? null,
      lastCheckedAt: latest?.checkedAt ?? null,
      uptimePercent30d,
      days,
    });
  })
);
