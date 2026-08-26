import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound, serviceUnavailable, tooManyRequests } from "../lib/errors";
import { parseArenaCodingConfig } from "../services/arenaSettings";
import { requireArenaAuth } from "../middleware/arenaAuth";
import { validateBody } from "../middleware/validate";
import { executionLimiter } from "../middleware/rateLimit";
import { getCodeHint } from "../services/aiHint";
import { consumeHintQuota, HINT_DAILY_LIMIT } from "../lib/arenaHintQuota";

export const arenaPracticeRouter = Router();

arenaPracticeRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const problems = await prisma.arenaPracticeProblem.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: "desc" },
      select: { slug: true, title: true, difficulty: true, tags: true },
    });
    res.json({ problems });
  })
);

arenaPracticeRouter.get(
  "/:slug",
  asyncHandler(async (req: Request, res: Response) => {
    const problem = await prisma.arenaPracticeProblem.findUnique({ where: { slug: req.params.slug } });
    if (!problem || !problem.isPublished) throw notFound("Problem not found");
    const cfg = parseArenaCodingConfig(problem.typeConfig);
    res.json({
      id: problem.id,
      slug: problem.slug,
      title: problem.title,
      bodyMd: problem.bodyMd,
      difficulty: problem.difficulty,
      tags: problem.tags,
      languages: cfg?.languages ?? [],
      starterCode: cfg?.starterCode ?? {},
      sampleCases: (cfg?.testCases ?? []).filter((tc) => !tc.isHidden),
    });
  })
);

/** Practice mode only — never wired into a live contest, so a hint can
 *  never undermine a scored round. */
arenaPracticeRouter.post(
  "/:problemId/hint",
  requireArenaAuth,
  executionLimiter,
  validateBody(z.object({ code: z.string().max(50_000).default(""), language: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const problem = await prisma.arenaPracticeProblem.findUnique({ where: { id: req.params.problemId } });
    if (!problem || !problem.isPublished) throw notFound("Problem not found");

    const { allowed, remaining } = await consumeHintQuota(req.arenaUser!.id);
    if (!allowed) {
      throw tooManyRequests(`You've used all ${HINT_DAILY_LIMIT} hints for today — come back tomorrow.`);
    }

    const { code, language } = req.body as { code: string; language: string };
    const hint = await getCodeHint({ bodyMd: problem.bodyMd, code, language });
    if (!hint) throw serviceUnavailable("Hints are unavailable right now, try again shortly.");
    res.json({ hint, remaining });
  })
);
