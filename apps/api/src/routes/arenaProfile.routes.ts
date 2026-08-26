import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/errors";
import { requireArenaAuth } from "../middleware/arenaAuth";
import { validateBody } from "../middleware/validate";
import { arenaSelfView, loadActivityHeatmap, loadPublicProfile, loadUserSubmissions } from "../services/arenaProfile";

export const arenaProfileRouter = Router();

arenaProfileRouter.get(
  "/me",
  requireArenaAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.arenaUser.findUniqueOrThrow({ where: { id: req.arenaUser!.id } });
    res.json({ user: arenaSelfView(user) });
  })
);

const updateMeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  bio: z.string().max(2000).optional(),
  country: z.string().max(100).optional(),
  avatarUrl: z.string().url().max(2000).optional(),
});

arenaProfileRouter.put(
  "/me",
  requireArenaAuth,
  validateBody(updateMeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await prisma.arenaUser.update({
      where: { id: req.arenaUser!.id },
      data: req.body as z.infer<typeof updateMeSchema>,
    });
    res.json({ user: arenaSelfView(updated) });
  })
);

arenaProfileRouter.get(
  "/users/:handle",
  asyncHandler(async (req: Request, res: Response) => {
    const profile = await loadPublicProfile(req.params.handle);
    res.json({ profile });
  })
);

arenaProfileRouter.get(
  "/users/:handle/heatmap",
  asyncHandler(async (req: Request, res: Response) => {
    const heatmap = await loadActivityHeatmap(req.params.handle);
    res.json({ heatmap });
  })
);

arenaProfileRouter.get(
  "/users/:handle/submissions",
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    res.json(await loadUserSubmissions(req.params.handle, page));
  })
);

arenaProfileRouter.get(
  "/stats",
  asyncHandler(async (_req: Request, res: Response) => {
    const [totalUsers, totalContests, totalAccepted] = await Promise.all([
      prisma.arenaUser.count(),
      prisma.arenaContestCache.count({ where: { status: { in: ["live", "grading", "completed"] } } }),
      prisma.arenaSubmission.count({ where: { status: "accepted" } }),
    ]);
    res.json({ totalUsers, totalContests, totalAccepted });
  })
);

arenaProfileRouter.get(
  "/leaderboard",
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 50;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const country = typeof req.query.country === "string" ? req.query.country.trim() : "";

    const where: Prisma.ArenaUserWhereInput = {
      ...(search ? { OR: [{ handle: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}),
      ...(country ? { country } : {}),
    };

    const [users, total] = await Promise.all([
      prisma.arenaUser.findMany({
        where,
        orderBy: { rating: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, handle: true, name: true, avatarUrl: true, rating: true, country: true },
      }),
      prisma.arenaUser.count({ where }),
    ]);

    // "Verified" = completed at least one contest under webcam or lockdown
    // Proctor-to-Earn proctoring — a real signal of identity, not just an
    // account that exists.
    const verifiedRows = await prisma.arenaParticipation.findMany({
      where: { userId: { in: users.map((u) => u.id) }, status: "submitted", chosenProctoringLevel: { in: ["webcam", "lockdown"] } },
      select: { userId: true },
      distinct: ["userId"],
    });
    const verifiedUserIds = new Set(verifiedRows.map((r) => r.userId));

    res.json({
      leaderboard: users.map((u, i) => ({
        rank: (page - 1) * pageSize + i + 1,
        handle: u.handle,
        name: u.name,
        avatarUrl: u.avatarUrl,
        rating: u.rating,
        country: u.country,
        verified: verifiedUserIds.has(u.id),
      })),
      page,
      pageSize,
      total,
    });
  })
);
