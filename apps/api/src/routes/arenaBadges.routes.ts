import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/errors";

export const arenaBadgesRouter = Router();

arenaBadgesRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const badges = await prisma.arenaBadge.findMany({ orderBy: { createdAt: "asc" } });
    res.json({
      badges: badges.map((b) => ({ key: b.key, name: b.name, description: b.description, iconKey: b.iconKey })),
    });
  })
);
