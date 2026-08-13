import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/errors";
import { requireAuth, requireStaffRead } from "../middleware/auth";
import { validateQuery } from "../middleware/validate";

/**
 * Backs the top-bar CommandPalette's live search: typing finds real records
 * (tests, questions), not just the static list of nav destinations it
 * already substring-filters client-side. Read-only, org-scoped like every
 * other staff route.
 */
export const searchRouter = Router();
searchRouter.use(requireAuth, requireStaffRead);

searchRouter.get(
  "/",
  validateQuery(z.object({ q: z.string().min(1).max(100) })),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query.q as string;
    const orgId = req.user!.orgId;
    const [tests, questions] = await Promise.all([
      prisma.test.findMany({
        where: { orgId, title: { contains: q, mode: "insensitive" } },
        select: { id: true, title: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.question.findMany({
        where: { orgId, title: { contains: q, mode: "insensitive" }, supersededById: null },
        select: { id: true, title: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);
    res.json({
      results: [
        ...tests.map((t) => ({ label: t.title, href: `/tests/${t.id}`, group: "Tests" })),
        ...questions.map((qu) => ({ label: qu.title, href: `/questions/${qu.id}`, group: "Questions" })),
      ],
    });
  })
);
