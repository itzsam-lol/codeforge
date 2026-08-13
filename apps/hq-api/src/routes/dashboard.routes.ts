import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/errors";
import { requireAuth } from "../middleware/auth";

// Deliberately ungated beyond requireAuth (mirrors apps/api's own
// /api/dashboard) — every HQ staff account's universal landing page,
// regardless of their permission scope.
export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const CLIENT_STATUSES = ["lead", "trial", "live", "churned"] as const;
const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "dismissed"] as const;

dashboardRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      clientsByStatus,
      mrrAgg,
      renewingSoon,
      leadsByStatus,
      newLeads30d,
      openTickets,
      activeStaff,
      targets,
      upcomingRenewals,
      recentLeads,
      recentAudit,
    ] = await Promise.all([
      prisma.client.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.client.aggregate({
        where: { status: { in: ["trial", "live"] } },
        _sum: { mrrCents: true },
      }),
      prisma.client.count({
        where: { nextRenewalDate: { not: null, lte: thirtyDaysOut, gte: new Date() } },
      }),
      prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.lead.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.supportTicket.count({ where: { status: { in: ["open", "pending"] } } }),
      prisma.hqStaff.count({ where: { isActive: true } }),
      prisma.provisioningTarget.findMany({
        select: {
          id: true,
          client: { select: { companyName: true } },
          healthCheckLogs: { orderBy: { checkedAt: "desc" }, take: 1, select: { healthy: true } },
        },
      }),
      prisma.client.findMany({
        where: { nextRenewalDate: { not: null, lte: thirtyDaysOut, gte: new Date() } },
        orderBy: { nextRenewalDate: "asc" },
        take: 8,
        select: { id: true, companyName: true, nextRenewalDate: true, mrrCents: true, status: true },
      }),
      prisma.lead.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, name: true, company: true, status: true, intent: true, createdAt: true },
      }),
      prisma.hqAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { actor: { select: { name: true } } },
      }),
    ]);

    const clientCounts = Object.fromEntries(CLIENT_STATUSES.map((s) => [s, 0])) as Record<
      (typeof CLIENT_STATUSES)[number],
      number
    >;
    for (const row of clientsByStatus) clientCounts[row.status] = row._count._all;

    const leadCounts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<
      (typeof LEAD_STATUSES)[number],
      number
    >;
    for (const row of leadsByStatus) leadCounts[row.status] = row._count._all;

    const targetsWithHealth = targets.filter((t) => t.healthCheckLogs.length > 0);
    const unhealthyCount = targetsWithHealth.filter((t) => !t.healthCheckLogs[0].healthy).length;

    res.json({
      stats: {
        totalClients: clientsByStatus.reduce((sum, r) => sum + r._count._all, 0),
        clientCounts,
        mrrCents: mrrAgg._sum.mrrCents ?? 0,
        renewingSoon,
        leadCounts,
        newLeads30d,
        openTickets,
        activeStaff,
        deploymentsMonitored: targetsWithHealth.length,
        deploymentsUnreachable: unhealthyCount,
        deploymentsTotal: targets.length,
      },
      upcomingRenewals,
      recentLeads,
      recentAudit: recentAudit.map((e) => ({
        id: e.id,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        metadata: e.metadata,
        actorName: e.actor.name,
        createdAt: e.createdAt,
      })),
    });
  })
);
