import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { LANGUAGE_IDS } from "@codeforge/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, conflict, notFound, serviceUnavailable } from "../lib/errors";
import { requireArenaAuth } from "../middleware/arenaAuth";
import { validateBody } from "../middleware/validate";
import { executionLimiter } from "../middleware/rateLimit";
import { executeCases } from "../lib/executor";
import { UnsupportedDevLanguageError } from "../lib/dockerExecutor";
import { Judge0UnavailableError } from "../lib/judge0";
import { assertLanguageAllowed, parseArenaCodingConfig, parseArenaMcqConfig } from "../services/arenaSettings";
import { recomputeParticipationScore, recordAcceptedActivity } from "../services/arenaGrading";
import { awardBadgesForSubmission } from "../services/arenaBadges";

export const arenaSubmissionsRouter = Router();

const submitSchema = z.object({
  code: z.string().min(1).max(200_000),
  language: z.enum(LANGUAGE_IDS as [string, ...string[]]),
});

/** mcq submissions carry selectedOptionIds instead of code/language — both
 *  shapes are optional at the schema level so one route can validate either,
 *  branching once it knows the question's actual type (see /submit below). */
const contestSubmitSchema = z.object({
  code: z.string().max(200_000).optional(),
  language: z.enum(LANGUAGE_IDS as [string, ...string[]]).optional(),
  selectedOptionIds: z.array(z.string()).optional(),
});

interface ContestCachePayload {
  status: string;
  questions: { contestQuestionId: string; type?: "coding" | "mcq"; points: number; typeConfig: unknown }[];
}

/** "Run": execute against the visible sample cases only — same UX split as
 *  the client product's candidate run/submit (candidate.routes.ts). */
arenaSubmissionsRouter.post(
  "/contests/:contestId/questions/:questionId/run",
  requireArenaAuth,
  executionLimiter,
  validateBody(submitSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { contestId, questionId } = req.params;
    const cache = await prisma.arenaContestCache.findUnique({ where: { contestId } });
    if (!cache || cache.status !== "live") throw conflict("This contest is not currently live");
    const payload = cache.payload as unknown as ContestCachePayload;
    const question = payload.questions.find((q) => q.contestQuestionId === questionId);
    if (!question) throw notFound("Question not found");
    const cfg = parseArenaCodingConfig(question.typeConfig);
    if (!cfg) throw badRequest("This problem is misconfigured, contact support");
    try {
      assertLanguageAllowed(cfg, req.body.language);
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : "Language not allowed");
    }
    const samples = cfg.testCases.filter((tc) => !tc.isHidden);
    if (samples.length === 0) throw badRequest("This question has no sample cases to run against, use Submit");

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

arenaSubmissionsRouter.post(
  "/contests/:contestId/questions/:questionId/submit",
  requireArenaAuth,
  executionLimiter,
  validateBody(contestSubmitSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { contestId, questionId } = req.params;
    const cache = await prisma.arenaContestCache.findUnique({ where: { contestId } });
    if (!cache || cache.status !== "live") throw conflict("This contest is not currently live");
    const payload = cache.payload as unknown as ContestCachePayload;
    const question = payload.questions.find((q) => q.contestQuestionId === questionId);
    if (!question) throw notFound("Question not found");

    const participation = await prisma.arenaParticipation.findUnique({
      where: { userId_contestId: { userId: req.arenaUser!.id, contestId } },
    });
    if (!participation) throw conflict("Register for this contest before submitting");
    if (participation.status === "disqualified") throw conflict("You've been disqualified from this contest");

    if (participation.status === "registered") {
      await prisma.arenaParticipation.update({ where: { id: participation.id }, data: { status: "active" } });
    }

    // ---- mcq: deferred grading. Revealing correct/incorrect immediately
    // during a live contest breaks competitive integrity (an MCQ becomes
    // free information the instant one person answers it) — the actual
    // verdict is computed once by gradeAllMcqs() during contest finalization
    // (see arenaGrading.ts, called from arenaRating.ts before ranking), same
    // as coding submissions never reveal hidden-test-case results live.
    // One-shot: a question already answered can't be re-submitted, enforced
    // here (not just hidden client-side) since this is a competitive-
    // integrity boundary, not just a UX nicety. ----
    if (question.type === "mcq") {
      const mcq = parseArenaMcqConfig(question.typeConfig);
      if (!mcq) throw badRequest("This problem is misconfigured, contact support");
      const body = req.body as z.infer<typeof contestSubmitSchema>;
      const selectedOptionIds = body.selectedOptionIds ?? [];
      if (selectedOptionIds.length === 0) throw badRequest("Select at least one option");

      const alreadyAnswered = await prisma.arenaSubmission.findFirst({
        where: { participationId: participation.id, contestQuestionId: questionId, mode: "contest" },
        select: { id: true },
      });
      if (alreadyAnswered) throw conflict("You've already answered this question — MCQ answers are locked in once submitted");

      const submission = await prisma.arenaSubmission.create({
        data: {
          userId: req.arenaUser!.id,
          mode: "contest",
          contestId,
          participationId: participation.id,
          contestQuestionId: questionId,
          selectedOptionIds,
          status: "pending_review",
          score: 0,
        },
      });
      res.status(201).json({ submissionId: submission.id, status: submission.status });
      return;
    }

    // ---- coding ----
    const cfg = parseArenaCodingConfig(question.typeConfig);
    if (!cfg) throw badRequest("This problem is misconfigured, contact support");
    const body = req.body as z.infer<typeof contestSubmitSchema>;
    if (!body.code || !body.language) throw badRequest("Code and language are required");
    try {
      assertLanguageAllowed(cfg, body.language);
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : "Language not allowed");
    }

    const submission = await prisma.arenaSubmission.create({
      data: {
        userId: req.arenaUser!.id,
        mode: "contest",
        contestId,
        participationId: participation.id,
        contestQuestionId: questionId,
        language: body.language,
        code: body.code,
        status: "pending",
      },
    });
    const { enqueueGradeArenaSubmission } = await import("../jobs/queues");
    await enqueueGradeArenaSubmission(submission.id);
    res.status(201).json({ submissionId: submission.id, status: submission.status });
  })
);

arenaSubmissionsRouter.post(
  "/practice/:problemId/submit",
  requireArenaAuth,
  executionLimiter,
  validateBody(submitSchema),
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

    const submission = await prisma.arenaSubmission.create({
      data: {
        userId: req.arenaUser!.id,
        mode: "practice",
        practiceProblemId: problem.id,
        language: req.body.language,
        code: req.body.code,
        status: "pending",
      },
    });
    const { enqueueGradeArenaSubmission } = await import("../jobs/queues");
    await enqueueGradeArenaSubmission(submission.id);
    res.status(201).json({ submissionId: submission.id, status: submission.status });
  })
);

/** Poll for a submission's graded result — the compete/practice UI polls
 *  this after a submit while status stays "pending". */
arenaSubmissionsRouter.get(
  "/submissions/:id",
  requireArenaAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const sub = await prisma.arenaSubmission.findFirst({
      where: { id: req.params.id, userId: req.arenaUser!.id },
    });
    if (!sub) throw notFound("Submission not found");
    res.json({
      id: sub.id,
      status: sub.status,
      score: sub.score,
      submittedAt: sub.submittedAt,
      results: (sub.judge0Meta as { results?: unknown[] } | null)?.results ?? null,
    });
  })
);
