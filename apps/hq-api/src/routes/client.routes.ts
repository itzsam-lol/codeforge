import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/errors";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateBody, singleLine } from "../middleware/validate";

export const clientRouter = Router();
clientRouter.use(requireAuth, requirePermission("clients"));

const CLIENT_STATUSES = ["lead", "trial", "live", "churned"] as const;

// Explicit select, never include: sshPrivateKeyEnc must never leave this
// module unencrypted-in-response — a bare `include` on ProvisioningTarget
// returns every scalar field, ciphertext included, which is exactly the
// mistake this select list exists to prevent (see lib/crypto.ts's own
// "never returned by any API response" comment).
const TARGET_SAFE_SELECT = {
  id: true,
  host: true,
  sshPort: true,
  sshUsername: true,
  sshKeyFingerprint: true,
  repoUrl: true,
  appDomain: true,
  mediaDomain: true,
  updatedAt: true,
} as const;

const HEALTH_INCLUDE = {
  provisioningTarget: {
    select: { ...TARGET_SAFE_SELECT, healthCheckLogs: { orderBy: { checkedAt: "desc" as const }, take: 1 } },
  },
} as const;

/** Flattens provisioningTarget.healthCheckLogs[0] into a top-level latestHealthCheck field. */
function withLatestHealthCheck<T extends { provisioningTarget: ({ healthCheckLogs: unknown[] } & Record<string, unknown>) | null }>(
  client: T
) {
  const { provisioningTarget, ...rest } = client;
  if (!provisioningTarget) return { ...rest, provisioningTarget: null, latestHealthCheck: null };
  const { healthCheckLogs, ...target } = provisioningTarget;
  const latestHealthCheck = (healthCheckLogs[0] as { healthy: boolean; checkedAt: Date } | undefined) ?? null;
  return { ...rest, provisioningTarget: target, latestHealthCheck };
}

clientRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const renewingSoon = req.query.renewingSoon === "true";
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const clients = await prisma.client.findMany({
      where: {
        status: status ? (status as (typeof CLIENT_STATUSES)[number]) : undefined,
        nextRenewalDate: renewingSoon ? { not: null, lte: thirtyDaysOut } : undefined,
      },
      orderBy: { updatedAt: "desc" },
      include: HEALTH_INCLUDE,
    });
    res.json({ clients: clients.map(withLatestHealthCheck) });
  })
);

clientRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        // Capped rather than unbounded: healthMonitor.ts appends a new
        // activity row on every health-state flip, so this list grows
        // indefinitely for a long-lived client. The full history is still
        // reachable via GET /:id/activities below.
        activities: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { author: { select: { name: true } } },
        },
        invoices: { orderBy: { createdAt: "desc" }, take: 50 },
        provisioningTarget: {
          select: { ...TARGET_SAFE_SELECT, healthCheckLogs: { orderBy: { checkedAt: "desc" }, take: 1 } },
        },
      },
    });
    if (!client) throw notFound("Client not found");
    res.json({ client: withLatestHealthCheck(client) });
  })
);

clientRouter.get(
  "/:id/activities",
  asyncHandler(async (req: Request, res: Response) => {
    const take = 20;
    const skip = Number(req.query.skip) || 0;
    const [activities, total] = await Promise.all([
      prisma.clientActivity.findMany({
        where: { clientId: req.params.id },
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { author: { select: { name: true } } },
      }),
      prisma.clientActivity.count({ where: { clientId: req.params.id } }),
    ]);
    res.json({ activities, total, hasMore: skip + activities.length < total });
  })
);

clientRouter.post(
  "/",
  validateBody(
    z.object({
      companyName: singleLine(200).min(1),
      contactName: z.string().min(1).max(200),
      contactEmail: z.string().email(),
      contactPhone: z.string().max(50).optional(),
      status: z.enum(CLIENT_STATUSES).default("lead"),
      notes: z.string().max(5000).optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const client = await prisma.client.create({ data: req.body });
    res.status(201).json({ client });
  })
);

clientRouter.put(
  "/:id",
  validateBody(
    z.object({
      companyName: singleLine(200).min(1).optional(),
      contactName: z.string().min(1).max(200).optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().max(50).optional(),
      status: z.enum(CLIENT_STATUSES).optional(),
      appDomain: singleLine(200).optional(),
      mediaDomain: singleLine(200).optional(),
      contractStartDate: z.coerce.date().optional(),
      contractEndDate: z.coerce.date().optional(),
      mrrCents: z.number().int().min(0).nullable().optional(),
      nextRenewalDate: z.coerce.date().nullable().optional(),
      notes: z.string().max(5000).optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Client not found");
    const body = req.body as { status?: string };
    const client = await prisma.client.update({ where: { id: req.params.id }, data: req.body });
    if (body.status && body.status !== existing.status) {
      await prisma.clientActivity.create({
        data: {
          clientId: client.id,
          authorId: req.staff!.id,
          type: "status_change",
          body: `Status changed from ${existing.status} to ${body.status}`,
        },
      });
    }
    res.json({ client });
  })
);

clientRouter.post(
  "/:id/activities",
  validateBody(z.object({ body: z.string().min(1).max(5000) })),
  asyncHandler(async (req: Request, res: Response) => {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw notFound("Client not found");
    const activity = await prisma.clientActivity.create({
      data: {
        clientId: client.id,
        authorId: req.staff!.id,
        type: "note",
        body: (req.body as { body: string }).body,
      },
      include: { author: { select: { name: true } } },
    });
    res.status(201).json({ activity });
  })
);
