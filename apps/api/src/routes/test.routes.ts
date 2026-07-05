import { Router } from "express";
import { z } from "zod";
import { PROCTORING_LEVELS, testSettingsSchema } from "@codeforge/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { requireAuth, requireStaffWrite } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { generateCandidateToken } from "../lib/tokens";
import { sendInvitationEmail } from "../lib/email";
import { config } from "../config";

export const testRouter = Router();
testRouter.use(requireAuth, requireStaffWrite);

const testBodySchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5_000).default(""),
  durationMinutes: z.number().int().min(5).max(480),
  proctoringLevel: z.enum(PROCTORING_LEVELS).default("none"),
  schedulingStart: z.coerce.date().nullish(),
  schedulingEnd: z.coerce.date().nullish(),
  settings: testSettingsSchema.default({}),
});

async function findOrgTest(testId: string, orgId: string) {
  const test = await prisma.test.findFirst({ where: { id: testId, orgId } });
  if (!test) throw notFound("Test not found");
  return test;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

testRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tests = await prisma.test.findMany({
      where: { orgId: req.user!.orgId, status: { not: "archived" } },
      include: {
        _count: { select: { questions: true, invitations: true, sessions: true } },
        sessions: { select: { status: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    res.json({
      tests: tests.map(({ sessions, ...t }) => ({
        ...t,
        counts: {
          questions: t._count.questions,
          invited: t._count.invitations,
          inProgress: sessions.filter((s) => s.status === "in_progress").length,
          completed: sessions.filter((s) =>
            ["submitted", "auto_submitted"].includes(s.status)
          ).length,
        },
      })),
    });
  })
);

testRouter.post(
  "/",
  validateBody(testBodySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof testBodySchema>;
    const test = await prisma.test.create({
      data: {
        orgId: req.user!.orgId,
        createdById: req.user!.id,
        title: body.title,
        description: body.description,
        durationMinutes: body.durationMinutes,
        proctoringLevel: body.proctoringLevel,
        schedulingStart: body.schedulingStart ?? null,
        schedulingEnd: body.schedulingEnd ?? null,
        settings: body.settings as unknown as Prisma.InputJsonValue,
      },
    });
    res.status(201).json({ test });
  })
);

testRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
          include: {
            question: {
              select: {
                id: true,
                title: true,
                type: true,
                difficulty: true,
                tags: true,
                estimatedMinutes: true,
              },
            },
          },
        },
        _count: { select: { invitations: true, sessions: true } },
      },
    });
    if (!test) throw notFound("Test not found");
    res.json({ test });
  })
);

testRouter.put(
  "/:id",
  validateBody(testBodySchema),
  asyncHandler(async (req, res) => {
    const existing = await findOrgTest(req.params.id, req.user!.orgId);
    if (existing.status === "archived") throw badRequest("Archived tests cannot be edited");
    const body = req.body as z.infer<typeof testBodySchema>;
    const test = await prisma.test.update({
      where: { id: existing.id },
      data: {
        title: body.title,
        description: body.description,
        durationMinutes: body.durationMinutes,
        proctoringLevel: body.proctoringLevel,
        schedulingStart: body.schedulingStart ?? null,
        schedulingEnd: body.schedulingEnd ?? null,
        settings: body.settings as unknown as Prisma.InputJsonValue,
      },
    });
    res.json({ test });
  })
);

/** Replace the ordered question list — only while the test is a draft. */
testRouter.put(
  "/:id/questions",
  validateBody(
    z.object({
      items: z
        .array(
          z.object({
            questionId: z.string().min(1),
            points: z.number().positive().max(1000).default(10),
          })
        )
        .max(100),
    })
  ),
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    if (test.status !== "draft") {
      throw badRequest("Questions can only be changed while the test is a draft");
    }
    const items = req.body.items as { questionId: string; points: number }[];
    const ids = items.map((i) => i.questionId);
    const questions = await prisma.question.findMany({
      where: { id: { in: ids }, orgId: req.user!.orgId, isArchived: false },
      select: { id: true, type: true },
    });
    const found = new Set(questions.map((q) => q.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) throw badRequest(`Unknown or archived question(s): ${missing.join(", ")}`);
    const unsupported = questions.filter((q) => !["dsa", "mcq"].includes(q.type));
    if (unsupported.length > 0) {
      throw badRequest("Only DSA and MCQ questions are supported in Phase 1");
    }

    await prisma.$transaction([
      prisma.testQuestion.deleteMany({ where: { testId: test.id } }),
      prisma.testQuestion.createMany({
        data: items.map((item, i) => ({
          testId: test.id,
          questionId: item.questionId,
          points: item.points,
          orderIndex: i,
        })),
      }),
    ]);
    res.json({ ok: true });
  })
);

testRouter.post(
  "/:id/publish",
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    if (test.status !== "draft") throw badRequest("Only draft tests can be published");
    const questionCount = await prisma.testQuestion.count({ where: { testId: test.id } });
    if (questionCount === 0) throw badRequest("Add at least one question before publishing");
    if (test.schedulingEnd && test.schedulingEnd < new Date()) {
      throw badRequest("Scheduling window ends in the past");
    }
    const updated = await prisma.test.update({
      where: { id: test.id },
      data: { status: "published" },
    });
    res.json({ test: updated });
  })
);

testRouter.post(
  "/:id/close",
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    if (test.status !== "published") throw badRequest("Only published tests can be closed");
    const updated = await prisma.test.update({
      where: { id: test.id },
      data: { status: "closed" },
    });
    res.json({ test: updated });
  })
);

testRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    await prisma.test.update({ where: { id: test.id }, data: { status: "archived" } });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Invitations (nested under a test)
// ---------------------------------------------------------------------------

testRouter.post(
  "/:id/invitations",
  validateBody(
    z.object({
      candidates: z
        .array(
          z.object({
            name: z.string().min(1).max(120),
            email: z.string().email(),
          })
        )
        .min(1)
        .max(500),
      expiresAt: z.coerce.date().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    if (test.status !== "published") {
      throw badRequest("Publish the test before inviting candidates");
    }
    const { candidates, expiresAt } = req.body as {
      candidates: { name: string; email: string }[];
      expiresAt?: Date;
    };
    const effectiveExpiry =
      expiresAt ?? test.schedulingEnd ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (effectiveExpiry < new Date()) throw badRequest("Expiry must be in the future");

    const existing = await prisma.invitation.findMany({
      where: { testId: test.id },
      select: { candidateEmail: true },
    });
    const already = new Set(existing.map((e) => e.candidateEmail.toLowerCase()));

    const created: { id: string; email: string; name: string; link: string }[] = [];
    const skipped: string[] = [];
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: test.orgId } });

    for (const c of candidates) {
      const email = c.email.toLowerCase();
      if (already.has(email)) {
        skipped.push(email);
        continue;
      }
      already.add(email);
      const token = generateCandidateToken();
      const inv = await prisma.invitation.create({
        data: {
          testId: test.id,
          candidateEmail: email,
          candidateName: c.name,
          token,
          expiresAt: effectiveExpiry,
        },
      });
      const link = `${config.webOrigin}/t/${token}`;
      created.push({ id: inv.id, email, name: c.name, link });
      await sendInvitationEmail({
        to: email,
        candidateName: c.name,
        testTitle: test.title,
        orgName: org.name,
        link,
        expiresAt: effectiveExpiry,
      });
    }
    res.status(201).json({ created, skipped });
  })
);

testRouter.get(
  "/:id/invitations",
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    const invitations = await prisma.invitation.findMany({
      where: { testId: test.id },
      include: {
        session: {
          select: { id: true, status: true, startedAt: true, submittedAt: true, endsAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      invitations: invitations.map((inv) => ({
        id: inv.id,
        candidateName: inv.candidateName,
        candidateEmail: inv.candidateEmail,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        link: `${config.webOrigin}/t/${inv.token}`,
        session: inv.session,
      })),
    });
  })
);
