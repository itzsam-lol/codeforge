import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/errors";
import { requireAuth, requireOwner } from "../middleware/auth";

// Owner-only: the trail covers staff permission changes, SSH-key rotations,
// and billing edits — the same sensitivity tier as /api/staff itself.
export const auditRouter = Router();
auditRouter.use(requireAuth, requireOwner);

auditRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const entries = await prisma.hqAuditLog.findMany({
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({
      entries: entries.map((e) => ({
        id: e.id,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        metadata: e.metadata,
        actorName: e.actor.name,
        actorEmail: e.actor.email,
        createdAt: e.createdAt,
      })),
    });
  })
);
