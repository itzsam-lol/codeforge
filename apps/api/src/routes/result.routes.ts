import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { requireAuth, requireStaffRead, requireStaffWrite } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  effectiveScore,
  getQuestionOrder,
  sessionTotals,
} from "../services/session";
import { parseMcqConfig } from "../services/settings";

/**
 * Recruiter/reviewer results routes. Reviewers get read-only access
 * (score overrides are staff-write only).
 */
export const resultRouter = Router();
resultRouter.use(requireAuth);

resultRouter.get(
  "/dashboard",
  requireStaffRead,
  asyncHandler(async (req, res) => {
    const orgId = req.user!.orgId;
    const [tests, published, invitations, completed, inProgress, questions] = await Promise.all([
      prisma.test.count({ where: { orgId, status: { not: "archived" } } }),
      prisma.test.count({ where: { orgId, status: "published" } }),
      prisma.invitation.count({ where: { test: { orgId } } }),
      prisma.testSession.count({
        where: { test: { orgId }, status: { in: ["submitted", "auto_submitted"] } },
      }),
      prisma.testSession.count({ where: { test: { orgId }, status: "in_progress" } }),
      prisma.question.count({ where: { orgId, isArchived: false, supersededById: null } }),
    ]);
    res.json({
      stats: { tests, published, invitations, completed, inProgress, questions },
    });
  })
);

resultRouter.get(
  "/tests/:testId/results",
  requireStaffRead,
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findFirst({
      where: { id: req.params.testId, orgId: req.user!.orgId },
    });
    if (!test) throw notFound("Test not found");

    const sessions = await prisma.testSession.findMany({
      where: { testId: test.id },
      include: { submissions: { where: { isFinal: true } } },
      orderBy: { createdAt: "desc" },
    });
    const invitationCounts = await prisma.invitation.groupBy({
      by: ["status"],
      where: { testId: test.id },
      _count: true,
    });
    // Highest similarity per session (candidate + reference kinds alike).
    const plagReports = await prisma.plagiarismReport.findMany({
      where: { submission: { session: { testId: test.id } } },
      select: { similarityPct: true, submission: { select: { sessionId: true } } },
      take: 2000,
    });
    const plagBySession = new Map<string, number>();
    for (const r of plagReports) {
      const sid = r.submission.sessionId;
      plagBySession.set(sid, Math.max(plagBySession.get(sid) ?? 0, r.similarityPct));
    }

    const rows = sessions.map((s) => {
      const { totalScore, maxScore } = sessionTotals(s);
      const gradingPending = s.submissions.some((sub) =>
        ["queued", "running"].includes(sub.status)
      );
      return {
        sessionId: s.id,
        candidateName: s.candidateName,
        candidateEmail: s.candidateEmail,
        status: s.status,
        startedAt: s.startedAt,
        submittedAt: s.submittedAt,
        endsAt: s.endsAt,
        totalScore,
        maxScore,
        gradingPending,
        timeTakenMinutes:
          s.startedAt && s.submittedAt
            ? Math.round((s.submittedAt.getTime() - s.startedAt.getTime()) / 60_000)
            : null,
        integrityScore: s.integrityScore,
        plagiarismMaxPct: plagBySession.get(s.id) ?? null,
      };
    });

    const completedRows = rows.filter((r) =>
      ["submitted", "auto_submitted"].includes(r.status)
    );
    res.json({
      test: { id: test.id, title: test.title, status: test.status },
      summary: {
        invited: invitationCounts.reduce((s, g) => s + g._count, 0),
        byInvitationStatus: Object.fromEntries(
          invitationCounts.map((g) => [g.status, g._count])
        ),
        started: rows.filter((r) => r.status !== "created").length,
        completed: completedRows.length,
        averageScore:
          completedRows.length > 0
            ? Math.round(
                (completedRows.reduce((s, r) => s + r.totalScore, 0) / completedRows.length) * 100
              ) / 100
            : null,
      },
      sessions: rows,
    });
  })
);

resultRouter.get(
  "/sessions/:sessionId",
  requireStaffRead,
  asyncHandler(async (req, res) => {
    const session = await prisma.testSession.findFirst({
      where: { id: req.params.sessionId, test: { orgId: req.user!.orgId } },
      include: {
        test: { select: { id: true, title: true, durationMinutes: true } },
        invitation: { select: { candidateEmail: true, status: true, failedAttempts: true } },
        drafts: true,
        submissions: {
          where: { kind: "submit" },
          orderBy: { version: "asc" },
          include: {
            judgeResults: {
              include: {
                testCase: {
                  select: { input: true, expectedOutput: true, isHidden: true, weight: true },
                },
              },
            },
          },
        },
      },
    });
    if (!session) throw notFound("Session not found");

    const order = getQuestionOrder(session);
    const questions = await prisma.question.findMany({
      where: { id: { in: order.map((o) => o.questionId) } },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));

    const breakdown = order
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((entry) => {
        const question = byId.get(entry.questionId);
        const subs = session.submissions.filter((s) => s.questionId === entry.questionId);
        const finalSub = subs.find((s) => s.isFinal) ?? subs[subs.length - 1] ?? null;
        const draft = session.drafts.find((d) => d.questionId === entry.questionId);
        const mcqConfig =
          question?.type === "mcq" ? parseMcqConfig(question.typeConfig) : null;
        return {
          questionId: entry.questionId,
          order: entry.order,
          points: entry.points,
          title: question?.title ?? "(deleted question)",
          type: question?.type ?? "dsa",
          difficulty: question?.difficulty,
          bodyMd: question?.bodyMd,
          // Recruiters see the full answer key — candidates never receive this.
          mcq: mcqConfig
            ? { options: mcqConfig.options, correctOptionIds: mcqConfig.correctOptionIds }
            : null,
          finalSubmission: finalSub
            ? {
                id: finalSub.id,
                content: finalSub.content,
                language: finalSub.language,
                status: finalSub.status,
                autoScore: finalSub.autoScore,
                manualScore: finalSub.manualScore,
                maxPoints: finalSub.maxPoints,
                effectiveScore: effectiveScore(finalSub),
                version: finalSub.version,
                submittedAt: finalSub.submittedAt,
                errorMessage: finalSub.errorMessage,
                judgeResults: finalSub.judgeResults.map((jr) => ({
                  verdict: jr.verdict,
                  passed: jr.passed,
                  stdout: jr.stdout,
                  stderr: jr.stderr,
                  compileOutput: jr.compileOutput,
                  timeMs: jr.timeMs,
                  memoryKb: jr.memoryKb,
                  testCase: jr.testCase,
                })),
              }
            : null,
          totalVersions: subs.length,
          draft:
            !finalSub && draft
              ? { content: draft.content, language: draft.language, updatedAt: draft.updatedAt }
              : null,
        };
      });

    const totals = sessionTotals({ ...session, submissions: session.submissions });
    res.json({
      session: {
        id: session.id,
        candidateName: session.candidateName,
        candidateEmail: session.candidateEmail,
        status: session.status,
        startedAt: session.startedAt,
        endsAt: session.endsAt,
        submittedAt: session.submittedAt,
        integrityScore: session.integrityScore,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        invitation: session.invitation,
      },
      test: session.test,
      totals,
      breakdown,
    });
  })
);

/** Manual score override — always kept separate from the automated score. */
resultRouter.patch(
  "/submissions/:submissionId/score",
  requireStaffWrite,
  validateBody(z.object({ manualScore: z.number().min(0).nullable() })),
  asyncHandler(async (req, res) => {
    const submission = await prisma.submission.findFirst({
      where: {
        id: req.params.submissionId,
        kind: "submit",
        session: { test: { orgId: req.user!.orgId } },
      },
    });
    if (!submission) throw notFound("Submission not found");
    const manualScore = req.body.manualScore as number | null;
    if (manualScore != null && manualScore > submission.maxPoints) {
      throw badRequest(`Score cannot exceed the question's ${submission.maxPoints} points`);
    }
    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: { manualScore },
    });
    res.json({
      submission: {
        id: updated.id,
        autoScore: updated.autoScore,
        manualScore: updated.manualScore,
        effectiveScore: effectiveScore(updated),
      },
    });
  })
);
