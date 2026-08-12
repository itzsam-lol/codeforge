import { Router } from "express";
import { z } from "zod";
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  dsaConfigSchema,
  mcqConfigSchema,
  rubricSchema,
  LANGUAGE_IDS,
} from "@codeforge/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { requireAuth, requireStaffWrite, requirePermission } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { executionLimiter } from "../middleware/rateLimit";
import { Judge0UnavailableError } from "../lib/judge0";
import { executeCases } from "../lib/executor";
import { UnsupportedDevLanguageError } from "../lib/dockerExecutor";
import { serviceUnavailable } from "../lib/errors";
import { parseDsaConfig, TYPE_CONFIG_SCHEMAS } from "../services/settings";
import { audit } from "../services/audit";

export const questionRouter = Router();
questionRouter.use(requireAuth, requireStaffWrite, requirePermission("questions"));

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const testCaseSchema = z.object({
  input: z.string().max(64_000).default(""),
  expectedOutput: z.string().max(64_000),
  isHidden: z.boolean().default(true),
  weight: z.number().positive().max(100).default(1),
});

const questionBodySchema = z.object({
  // All six question types are authorable as of Phase 3.
  type: z.enum(QUESTION_TYPES),
  title: z.string().min(3).max(200),
  bodyMd: z.string().min(1).max(100_000),
  difficulty: z.enum(DIFFICULTIES),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  estimatedMinutes: z.number().int().positive().max(600).optional(),
  isShared: z.boolean().default(false),
  typeConfig: z.unknown(),
  testCases: z.array(testCaseSchema).max(100).default([]),
  rubric: rubricSchema.optional(),
});

type QuestionBody = z.infer<typeof questionBodySchema>;

/** Validate typeConfig against the type's schema and enforce type invariants. */
function normalizeBody(body: QuestionBody) {
  if (body.type === "dsa") {
    const cfg = dsaConfigSchema.parse(body.typeConfig ?? {});
    if (body.testCases.length === 0) {
      throw badRequest("DSA questions need at least one test case");
    }
    return { typeConfig: cfg as unknown as Prisma.InputJsonValue, testCases: body.testCases };
  }
  // Every other type validates its own JSONB config; only DSA uses TestCase rows.
  const cfg = TYPE_CONFIG_SCHEMAS[body.type].parse(body.typeConfig ?? {});
  return { typeConfig: cfg as unknown as Prisma.InputJsonValue, testCases: [] };
}

/** Frontend questions need their reference design re-rendered on save. */
async function afterSaveHook(question: { id: string; type: string }): Promise<void> {
  if (question.type === "frontend_ui") {
    const { gradeQueue } = await import("../jobs/queues");
    await gradeQueue.add("render-reference", { questionId: question.id }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

questionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { type, difficulty, tag, q, archived } = req.query as Record<string, string>;
    const questions = await prisma.question.findMany({
      where: {
        orgId: req.user!.orgId,
        supersededById: null, // latest versions only
        isArchived: archived === "true" ? undefined : false,
        ...(type ? { type: type as never } : {}),
        ...(difficulty ? { difficulty: difficulty as never } : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      },
      include: {
        _count: {
          select: {
            testCases: true,
            submissions: { where: { kind: "submit" } },
            testQuestions: true,
          },
        },
        createdBy: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ questions });
  })
);

questionRouter.post(
  "/",
  validateBody(questionBodySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as QuestionBody;
    const { typeConfig, testCases } = normalizeBody(body);
    const question = await prisma.question.create({
      data: {
        orgId: req.user!.orgId,
        createdById: req.user!.id,
        type: body.type,
        title: body.title,
        bodyMd: body.bodyMd,
        difficulty: body.difficulty,
        tags: body.tags,
        estimatedMinutes: body.estimatedMinutes,
        isShared: body.isShared,
        typeConfig,
        rubric: (body.rubric as unknown as Prisma.InputJsonValue) ?? undefined,
        testCases: {
          create: testCases.map((tc, i) => ({ ...tc, orderIndex: i })),
        },
      },
      include: { testCases: { orderBy: { orderIndex: "asc" } } },
    });
    await afterSaveHook(question);
    res.status(201).json({ question });
  })
);

questionRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const question = await prisma.question.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
      include: {
        testCases: { orderBy: { orderIndex: "asc" } },
        _count: { select: { submissions: { where: { kind: "submit" } } } },
      },
    });
    if (!question) throw notFound("Question not found");
    res.json({ question });
  })
);

/**
 * Edit a question. If it already has real submissions, the edit creates a NEW
 * version (spec 3.2): historical results keep pointing at the old row; draft
 * tests are re-pointed at the new one automatically.
 */
questionRouter.put(
  "/:id",
  validateBody(questionBodySchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.question.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId, supersededById: null },
      include: { _count: { select: { submissions: { where: { kind: "submit" } } } } },
    });
    if (!existing) throw notFound("Question not found (or already superseded)");

    const body = req.body as QuestionBody;
    if (body.type !== existing.type) throw badRequest("A question's type cannot change");
    const { typeConfig, testCases } = normalizeBody(body);

    const commonData = {
      title: body.title,
      bodyMd: body.bodyMd,
      difficulty: body.difficulty,
      tags: body.tags,
      estimatedMinutes: body.estimatedMinutes ?? null,
      isShared: body.isShared,
      typeConfig,
      rubric: (body.rubric as unknown as Prisma.InputJsonValue) ?? undefined,
    };

    if (existing._count.submissions === 0) {
      // No history to protect, mutate in place.
      const question = await prisma.$transaction(async (tx) => {
        await tx.testCase.deleteMany({ where: { questionId: existing.id } });
        return tx.question.update({
          where: { id: existing.id },
          data: {
            ...commonData,
            testCases: { create: testCases.map((tc, i) => ({ ...tc, orderIndex: i })) },
          },
          include: { testCases: { orderBy: { orderIndex: "asc" } } },
        });
      });
      await afterSaveHook(question);
      res.json({ question, versioned: false });
      return;
    }

    const question = await prisma.$transaction(async (tx) => {
      const next = await tx.question.create({
        data: {
          ...commonData,
          orgId: existing.orgId,
          createdById: req.user!.id,
          type: existing.type,
          version: existing.version + 1,
          rootId: existing.rootId ?? existing.id,
          testCases: { create: testCases.map((tc, i) => ({ ...tc, orderIndex: i })) },
        },
        include: { testCases: { orderBy: { orderIndex: "asc" } } },
      });
      await tx.question.update({
        where: { id: existing.id },
        data: { supersededById: next.id },
      });
      // Draft tests should use the new version; published tests keep the old
      // one so in-flight sessions stay consistent.
      const draftRefs = await tx.testQuestion.findMany({
        where: { questionId: existing.id, test: { status: "draft" } },
        select: { id: true },
      });
      if (draftRefs.length > 0) {
        await tx.testQuestion.updateMany({
          where: { id: { in: draftRefs.map((r) => r.id) } },
          data: { questionId: next.id },
        });
      }
      return next;
    });
    await afterSaveHook(question);
    res.json({ question, versioned: true });
  })
);

questionRouter.post(
  "/:id/duplicate",
  asyncHandler(async (req, res) => {
    const source = await prisma.question.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
      include: { testCases: { orderBy: { orderIndex: "asc" } } },
    });
    if (!source) throw notFound("Question not found");
    const question = await prisma.question.create({
      data: {
        orgId: source.orgId,
        createdById: req.user!.id,
        type: source.type,
        title: `${source.title} (copy)`,
        bodyMd: source.bodyMd,
        difficulty: source.difficulty,
        tags: source.tags,
        estimatedMinutes: source.estimatedMinutes,
        typeConfig: source.typeConfig as Prisma.InputJsonValue,
        rubric: (source.rubric as Prisma.InputJsonValue) ?? undefined,
        testCases: {
          create: source.testCases.map((tc, i) => ({
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isHidden: tc.isHidden,
            weight: tc.weight,
            orderIndex: i,
          })),
        },
      },
    });
    res.status(201).json({ question });
  })
);

questionRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.question.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!existing) throw notFound("Question not found");
    // Soft delete: historical submissions may reference it.
    await prisma.question.update({
      where: { id: existing.id },
      data: { isArchived: true },
    });
    await audit(req.user!.orgId, req.user!.id, "question.archive", "question", existing.id, {
      title: existing.title,
    });
    res.json({ ok: true });
  })
);

/**
 * Preview mode (spec 3.2): the recruiter attempts their own question exactly
 * as a candidate would, but against ALL test cases including hidden ones.
 */
questionRouter.post(
  "/:id/preview-run",
  executionLimiter,
  validateBody(
    z.object({
      code: z.string().min(1).max(200_000),
      language: z.enum(LANGUAGE_IDS as [string, ...string[]]),
    })
  ),
  asyncHandler(async (req, res) => {
    const question = await prisma.question.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId, type: "dsa" },
      include: { testCases: { orderBy: { orderIndex: "asc" } } },
    });
    if (!question) throw notFound("DSA question not found");
    const cfg = parseDsaConfig(question.typeConfig);
    try {
      const outcomes = await executeCases({
        languageId: req.body.language,
        sourceCode: req.body.code,
        cases: question.testCases.map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
        })),
        timeLimitMs: cfg.timeLimitMs,
        memoryLimitKb: cfg.memoryLimitKb,
      });
      res.json({
        results: outcomes.map((o, i) => ({
          ...o,
          input: question.testCases[i].input,
          expectedOutput: question.testCases[i].expectedOutput,
          isHidden: question.testCases[i].isHidden,
          weight: question.testCases[i].weight,
        })),
      });
    } catch (err) {
      if (err instanceof UnsupportedDevLanguageError) throw badRequest(err.message);
      if (err instanceof Judge0UnavailableError) throw serviceUnavailable(err.message);
      throw err;
    }
  })
);
