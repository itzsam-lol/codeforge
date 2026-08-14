import { Router } from "express";
import { z } from "zod";
import { PROCTORING_LEVELS, testSettingsSchema } from "@codeforge/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { requireAuth, requireStaffRead, requireStaffWrite, requirePermission } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { generateCandidateToken, hashToken } from "../lib/tokens";
import { sendInvitationEmail } from "../lib/email";
import { config } from "../config";
import { audit } from "../services/audit";
import { csvCell, sendCsv } from "../lib/csv";

export const testRouter = Router();
// requireAuth only, router-wide: a router-wide requireStaffWrite here would
// block the "reviewer" role from every route in this router, including the
// read-only ones below that are meant to be reviewer-reachable (their own
// requirePermission(...) OR-gates already admit results/analytics/
// invitations, which reviewers can hold) — role gates now live per-route
// instead, requireStaffRead on GETs and requireStaffWrite on writes.
testRouter.use(requireAuth);

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
  requireStaffRead,
  requirePermission("tests", "invitations", "results", "analytics"),
  asyncHandler(async (req, res) => {
    const tests = await prisma.test.findMany({
      where: { orgId: req.user!.orgId, status: { not: "archived" } },
      include: {
        _count: { select: { questions: true, invitations: true, sessions: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    // Aggregated in the DB instead of pulling every session row per test —
    // this endpoint feeds both the dashboard and the tests list, so it
    // otherwise scales linearly with total session count on every load.
    const grouped = await prisma.testSession.groupBy({
      by: ["testId", "status"],
      where: { testId: { in: tests.map((t) => t.id) } },
      _count: true,
    });
    const countsByTest = new Map<string, { inProgress: number; completed: number }>();
    for (const g of grouped) {
      const entry = countsByTest.get(g.testId) ?? { inProgress: 0, completed: 0 };
      if (g.status === "in_progress") entry.inProgress += g._count;
      else if (g.status === "submitted" || g.status === "auto_submitted") entry.completed += g._count;
      countsByTest.set(g.testId, entry);
    }
    res.json({
      tests: tests.map((t) => ({
        ...t,
        counts: {
          questions: t._count.questions,
          invited: t._count.invitations,
          inProgress: countsByTest.get(t.id)?.inProgress ?? 0,
          completed: countsByTest.get(t.id)?.completed ?? 0,
        },
      })),
    });
  })
);

testRouter.post(
  "/",
  requireStaffWrite,
  requirePermission("tests"),
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

// Registered before "/:id" below: Express matches path patterns in
// registration order, and a parameterized "/:id" would otherwise shadow
// "/bulk" and "/export.csv" (matching them with id="bulk"/"export.csv").
/**
 * Bulk publish/archive. Partial-success: each test is checked against the
 * same guard its singular route already enforces (publish only from draft,
 * with at least one question, no expired scheduling window), and a test
 * that fails its guard is skipped rather than aborting the whole batch.
 */
testRouter.post(
  "/bulk",
  requireStaffWrite,
  requirePermission("tests"),
  validateBody(
    z.object({
      testIds: z.array(z.string().min(1)).min(1).max(200),
      action: z.enum(["publish", "archive"]),
    })
  ),
  asyncHandler(async (req, res) => {
    const { testIds, action } = req.body as { testIds: string[]; action: "publish" | "archive" };
    const tests = await prisma.test.findMany({ where: { id: { in: testIds }, orgId: req.user!.orgId } });

    let updated = 0;
    let skipped = 0;
    for (const test of tests) {
      if (action === "publish") {
        if (test.status !== "draft") {
          skipped++;
          continue;
        }
        const questionCount = await prisma.testQuestion.count({ where: { testId: test.id } });
        if (questionCount === 0 || (test.schedulingEnd && test.schedulingEnd < new Date())) {
          skipped++;
          continue;
        }
        await prisma.test.update({ where: { id: test.id }, data: { status: "published" } });
        await audit(req.user!.orgId, req.user!.id, "test.publish", "test", test.id, { title: test.title });
        updated++;
      } else {
        if (test.status === "archived") {
          skipped++;
          continue;
        }
        await prisma.test.update({ where: { id: test.id }, data: { status: "archived" } });
        await audit(req.user!.orgId, req.user!.id, "test.archive", "test", test.id, { title: test.title });
        updated++;
      }
    }
    skipped += testIds.length - tests.length; // ids that didn't resolve to a test in this org
    res.json({ ok: true, updated, skipped });
  })
);

testRouter.get(
  "/export.csv",
  requireStaffRead,
  requirePermission("tests", "invitations", "results", "analytics"),
  asyncHandler(async (req, res) => {
    const tests = await prisma.test.findMany({
      where: { orgId: req.user!.orgId, status: { not: "archived" } },
      include: { _count: { select: { questions: true, invitations: true } } },
      orderBy: { updatedAt: "desc" },
    });
    const grouped = await prisma.testSession.groupBy({
      by: ["testId", "status"],
      where: { testId: { in: tests.map((t) => t.id) } },
      _count: true,
    });
    const countsByTest = new Map<string, { inProgress: number; completed: number }>();
    for (const g of grouped) {
      const entry = countsByTest.get(g.testId) ?? { inProgress: 0, completed: 0 };
      if (g.status === "in_progress") entry.inProgress += g._count;
      else if (g.status === "submitted" || g.status === "auto_submitted") entry.completed += g._count;
      countsByTest.set(g.testId, entry);
    }

    const header = ["Title", "Status", "Duration (min)", "Questions", "Invited", "In progress", "Completed", "Updated"];
    const lines = [header.join(",")];
    for (const t of tests) {
      const counts = countsByTest.get(t.id) ?? { inProgress: 0, completed: 0 };
      lines.push(
        [
          csvCell(t.title),
          csvCell(t.status),
          csvCell(t.durationMinutes),
          csvCell(t._count.questions),
          csvCell(t._count.invitations),
          csvCell(counts.inProgress),
          csvCell(counts.completed),
          csvCell(t.updatedAt.toISOString()),
        ].join(",")
      );
    }
    sendCsv(res, "tests.csv", lines);
  })
);

// Basic test metadata backs every tab on the recruiter test-detail page
// (Overview/Questions/Invitations/Results/Analytics), so this one read route
// admits any of those permissions rather than "tests" alone — an
// invitations-only employee still needs to load the page around their tab.
testRouter.get(
  "/:id",
  requireStaffRead,
  requirePermission("tests", "invitations", "results", "analytics"),
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
            pool: { select: { id: true, name: true, questionIds: true } },
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
  requireStaffWrite,
  requirePermission("tests"),
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

/**
 * Deep-copies the test's own settings plus its question pools and ordered
 * slots (remapping each slot's poolId through the newly-created pools) — but
 * never invitations/sessions, which are per-run candidate data, not template
 * data. Always lands as a fresh draft: status, schedulingStart/End are reset
 * rather than carried over, since a copy shouldn't inherit a stale window or
 * the source's publish state.
 */
testRouter.post(
  "/:id/duplicate",
  requireStaffWrite,
  requirePermission("tests"),
  asyncHandler(async (req, res) => {
    const source = await prisma.test.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
      include: {
        questions: { orderBy: { orderIndex: "asc" } },
        pools: true,
      },
    });
    if (!source) throw notFound("Test not found");

    const test = await prisma.$transaction(async (tx) => {
      const created = await tx.test.create({
        data: {
          orgId: source.orgId,
          createdById: req.user!.id,
          title: `${source.title} (copy)`,
          description: source.description,
          durationMinutes: source.durationMinutes,
          settings: source.settings as Prisma.InputJsonValue,
          proctoringLevel: source.proctoringLevel,
          schedulingStart: null,
          schedulingEnd: null,
          status: "draft",
        },
      });

      const poolIdMap = new Map<string, string>();
      for (const pool of source.pools) {
        const newPool = await tx.questionPool.create({
          data: { testId: created.id, name: pool.name, questionIds: pool.questionIds },
        });
        poolIdMap.set(pool.id, newPool.id);
      }

      if (source.questions.length > 0) {
        await tx.testQuestion.createMany({
          data: source.questions.map((q) => ({
            testId: created.id,
            questionId: q.questionId,
            poolId: q.poolId ? (poolIdMap.get(q.poolId) ?? null) : null,
            orderIndex: q.orderIndex,
            points: q.points,
          })),
        });
      }

      return created;
    });

    res.status(201).json({ test });
  })
);

/**
 * Replace the ordered question list, only while the test is a draft. Each
 * slot is either a fixed question or a pool of interchangeable difficulty-
 * equivalent questions (spec 3.3): each candidate gets a random pick, frozen
 * on their session, which reduces answer-sharing across staggered start times.
 */
testRouter.put(
  "/:id/questions",
  requireStaffWrite,
  requirePermission("tests"),
  validateBody(
    z.object({
      items: z
        .array(
          z
            .object({
              questionId: z.string().min(1).optional(),
              poolId: z.string().min(1).optional(),
              points: z.number().positive().max(1000).default(10),
            })
            .refine((i) => Boolean(i.questionId) !== Boolean(i.poolId), {
              message: "each slot needs exactly one of questionId or poolId",
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
    const items = req.body.items as { questionId?: string; poolId?: string; points: number }[];

    const questionIds = items.flatMap((i) => (i.questionId ? [i.questionId] : []));
    if (questionIds.length > 0) {
      const questions = await prisma.question.findMany({
        where: { id: { in: questionIds }, orgId: req.user!.orgId, isArchived: false },
        select: { id: true },
      });
      const found = new Set(questions.map((q) => q.id));
      const missing = questionIds.filter((id) => !found.has(id));
      if (missing.length > 0) throw badRequest(`Unknown or archived question(s): ${missing.join(", ")}`);
    }
    const poolIds = items.flatMap((i) => (i.poolId ? [i.poolId] : []));
    if (poolIds.length > 0) {
      const pools = await prisma.questionPool.count({ where: { id: { in: poolIds }, testId: test.id } });
      if (pools !== new Set(poolIds).size) throw badRequest("Unknown question pool(s) for this test");
    }

    await prisma.$transaction([
      prisma.testQuestion.deleteMany({ where: { testId: test.id } }),
      prisma.testQuestion.createMany({
        data: items.map((item, i) => ({
          testId: test.id,
          questionId: item.questionId ?? null,
          poolId: item.poolId ?? null,
          points: item.points,
          orderIndex: i,
        })),
      }),
    ]);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Question pools (spec 3.3): interchangeable difficulty-equivalent slots
// ---------------------------------------------------------------------------

testRouter.get(
  "/:id/pools",
  requireStaffRead,
  requirePermission("tests"),
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    const pools = await prisma.questionPool.findMany({ where: { testId: test.id } });
    res.json({ pools });
  })
);

testRouter.post(
  "/:id/pools",
  requireStaffWrite,
  requirePermission("tests"),
  validateBody(
    z.object({
      name: z.string().min(1).max(120),
      questionIds: z.array(z.string().min(1)).min(2).max(20),
    })
  ),
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    if (test.status !== "draft") throw badRequest("Pools can only be edited while the test is a draft");
    const { name, questionIds } = req.body as { name: string; questionIds: string[] };
    const found = await prisma.question.count({
      where: { id: { in: questionIds }, orgId: req.user!.orgId, isArchived: false },
    });
    if (found !== new Set(questionIds).size) throw badRequest("Unknown or archived question(s) in pool");
    const pool = await prisma.questionPool.create({
      data: { testId: test.id, name, questionIds },
    });
    res.status(201).json({ pool });
  })
);

testRouter.delete(
  "/:id/pools/:poolId",
  requireStaffWrite,
  requirePermission("tests"),
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    if (test.status !== "draft") throw badRequest("Pools can only be edited while the test is a draft");
    const pool = await prisma.questionPool.findFirst({
      where: { id: req.params.poolId, testId: test.id },
    });
    if (!pool) throw notFound("Pool not found");
    await prisma.$transaction([
      prisma.testQuestion.deleteMany({ where: { poolId: pool.id } }),
      prisma.questionPool.delete({ where: { id: pool.id } }),
    ]);
    res.json({ ok: true });
  })
);

testRouter.post(
  "/:id/publish",
  requireStaffWrite,
  requirePermission("tests"),
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
    await audit(req.user!.orgId, req.user!.id, "test.publish", "test", test.id, { title: test.title });
    res.json({ test: updated });
  })
);

testRouter.post(
  "/:id/close",
  requireStaffWrite,
  requirePermission("tests"),
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    if (test.status !== "published") throw badRequest("Only published tests can be closed");
    const updated = await prisma.test.update({
      where: { id: test.id },
      data: { status: "closed" },
    });
    await audit(req.user!.orgId, req.user!.id, "test.close", "test", test.id, { title: test.title });
    res.json({ test: updated });
  })
);

testRouter.delete(
  "/:id",
  requireStaffWrite,
  requirePermission("tests"),
  asyncHandler(async (req, res) => {
    const test = await findOrgTest(req.params.id, req.user!.orgId);
    await prisma.test.update({ where: { id: test.id }, data: { status: "archived" } });
    await audit(req.user!.orgId, req.user!.id, "test.archive", "test", test.id, { title: test.title });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Invitations (nested under a test)
// ---------------------------------------------------------------------------

testRouter.post(
  "/:id/invitations",
  requireStaffWrite,
  requirePermission("invitations"),
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
          tokenHash: hashToken(token),
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
  requireStaffRead,
  requirePermission("invitations"),
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
        // Only legacy (pre-hashing) rows still have the raw token needed to
        // reconstruct a link on demand; newer rows only ever exposed it once,
        // at creation/resend time — the UI falls back to a "Resend" action.
        link: inv.token ? `${config.webOrigin}/t/${inv.token}` : null,
        session: inv.session,
      })),
    });
  })
);
