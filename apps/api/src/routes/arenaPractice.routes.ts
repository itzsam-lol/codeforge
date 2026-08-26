import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { LANGUAGE_IDS } from "@codeforge/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound, serviceUnavailable, tooManyRequests } from "../lib/errors";
import { assertLanguageAllowed, parseArenaCodingConfig } from "../services/arenaSettings";
import { requireArenaAuth } from "../middleware/arenaAuth";
import { validateBody } from "../middleware/validate";
import { executionLimiter } from "../middleware/rateLimit";
import { executeCases } from "../lib/executor";
import { UnsupportedDevLanguageError } from "../lib/dockerExecutor";
import { Judge0UnavailableError } from "../lib/judge0";
import { getCodeHint } from "../services/aiHint";
import { consumeHintQuota, HINT_DAILY_LIMIT } from "../lib/arenaHintQuota";

const runSchema = z.object({
  code: z.string().min(1).max(200_000),
  language: z.enum(LANGUAGE_IDS as [string, ...string[]]),
});

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

/** Mirrors the contest run endpoint (arenaSubmissions.routes.ts): execute
 *  against visible sample cases only, no ArenaSubmission row created. */
arenaPracticeRouter.post(
  "/:problemId/run",
  requireArenaAuth,
  executionLimiter,
  validateBody(runSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const problem = await prisma.arenaPracticeProblem.findUnique({ where: { id: req.params.problemId } });
    if (!problem || !problem.isPublished) throw notFound("Problem not found");
    const cfg = parseArenaCodingConfig(problem.typeConfig);
    if (!cfg) throw badRequest("This problem is misconfigured, contact support");
    try {
      assertLanguageAllowed(cfg, req.body.language);
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : "Language not allowed");
    }
    const samples = cfg.testCases.filter((tc) => !tc.isHidden);
    if (samples.length === 0) throw badRequest("This problem has no sample cases to run against, use Submit");

    try {
      const outcomes = await executeCases({
        languageId: req.body.language,
        sourceCode: req.body.code,
        cases: samples.map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput })),
        timeLimitMs: cfg.timeLimitMs,
        memoryLimitKb: cfg.memoryLimitKb,
      });
      res.json({
        results: outcomes.map((o, i) => ({
          input: samples[i].input,
          expectedOutput: samples[i].expectedOutput,
          stdout: o.stdout,
          stderr: o.stderr,
          compileOutput: o.compileOutput,
          verdict: o.verdict,
          passed: o.passed,
          timeMs: o.timeMs,
          memoryKb: o.memoryKb,
        })),
      });
    } catch (err) {
      if (err instanceof UnsupportedDevLanguageError) throw badRequest(err.message);
      if (err instanceof Judge0UnavailableError) {
        throw serviceUnavailable("The code runner is temporarily unavailable. Try again shortly.");
      }
      throw err;
    }
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
