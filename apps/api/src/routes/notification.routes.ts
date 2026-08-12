import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

notificationRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const notifications = await prisma.notification.findMany({
      where: { orgId: req.user!.orgId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    res.json({ notifications });
  })
);

notificationRouter.get(
  "/unread-count",
  asyncHandler(async (req: Request, res: Response) => {
    const count = await prisma.notification.count({ where: { orgId: req.user!.orgId, readAt: null } });
    res.json({ count });
  })
);

notificationRouter.post(
  "/:id/read",
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.notification.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!existing) throw notFound("Notification not found");
    await prisma.notification.update({ where: { id: existing.id }, data: { readAt: new Date() } });
    res.json({ ok: true });
  })
);

notificationRouter.post(
  "/read-all",
  asyncHandler(async (req: Request, res: Response) => {
    await prisma.notification.updateMany({
      where: { orgId: req.user!.orgId, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  })
);
