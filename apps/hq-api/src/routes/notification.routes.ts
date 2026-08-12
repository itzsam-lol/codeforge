import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

notificationRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const notifications = await prisma.hqNotification.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
    res.json({ notifications });
  })
);

notificationRouter.get(
  "/unread-count",
  asyncHandler(async (_req: Request, res: Response) => {
    const count = await prisma.hqNotification.count({ where: { readAt: null } });
    res.json({ count });
  })
);

notificationRouter.post(
  "/:id/read",
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.hqNotification.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Notification not found");
    await prisma.hqNotification.update({ where: { id: existing.id }, data: { readAt: new Date() } });
    res.json({ ok: true });
  })
);

notificationRouter.post(
  "/read-all",
  asyncHandler(async (_req: Request, res: Response) => {
    await prisma.hqNotification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  })
);
