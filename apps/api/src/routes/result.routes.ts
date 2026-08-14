import { Router } from "express";
import { z } from "zod";
import { DEFAULT_MANUAL_RUBRIC, rubricScoresSchema } from "@codeforge/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { requireAuth, requireStaffRead, requireStaffWrite, requirePermission } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  effectiveScore,
  getQuestionOrder,
  sessionTotals,
} from "../services/session";
import { parseMcqConfig } from "../services/settings";
import { presignGet, deleteObject } from "../lib/s3";
import { audit } from "../services/audit";
import { notifyResultsReadyIfComplete } from "../services/notifications";
import { csvCell, sendCsv } from "../lib/csv";

/**
 * Recruiter/reviewer results routes. Reviewers get read-only access
 * (score overrides are staff-write only).
 */
export const resultRouter = Router();
resultRouter.use(requireAuth);

/**
 * Replace object-storage keys in judge-result metadata with short-lived
 * presigned URLs (visual-diff, candidate, and preview screenshots). Raw keys
 * never reach the client.
 */
async function presignMetadata(metadata: unknown): Promise<Record<string, unknown> | null> {
  if (!metadata || typeof metadata !== "object") return null;
  const m = { ...(metadata as Record<string, unknown>) };
  for (const field of ["candidateKey", "diffKey", "referenceKey", "key"]) {
    if (typeof m[field] === "string") {
      const urlField = field.replace(/Key$/, "Url").replace(/^key$/, "url");
      m[urlField] = await presignGet(m[field] as string);
      delete m[field];
    }
  }
  return m;
}

/**
 * Staff activity trail (spec 8 observability): who did what, most recent
 * first. Gated on "settings" — it exposes every staff account's email,
 * role, and exact permission set (via user.create/update audit rows) plus
 * candidate PII from other feature areas, so a narrowly-scoped account
 * (e.g. questions-only) must not reach it just by having staff-read access.
 */
resultRouter.get(
  "/audit-log",
  requireStaffRead,
  requirePermission("settings"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const entries = await prisma.auditLog.findMany({
      where: { orgId: req.user!.orgId },
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({
      entries: entries.map((e) => ({
        id: e.id,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        metadata: e.metadata,
        actorName: e.actor.name,
        actorEmail: e.actor.email,
        createdAt: e.createdAt,
      })),
    });
  })
);

/** Same audit trail as GET /audit-log, as a CSV download — same gate, since
 *  it exposes the same staff PII. Capped higher than the JSON view's default
 *  (an export is a deliberate one-off pull, not a page render). */
resultRouter.get(
  "/audit-log.csv",
  requireStaffRead,
  requirePermission("settings"),
  asyncHandler(async (req, res) => {
    const entries = await prisma.auditLog.findMany({
      where: { orgId: req.user!.orgId },
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const header = ["Action", "Target type", "Target ID", "Actor name", "Actor email", "When"];
    const lines = [header.join(",")];
    for (const e of entries) {
      lines.push(
        [
          csvCell(e.action),
          csvCell(e.targetType),
          csvCell(e.targetId),
          csvCell(e.actor.name),
          csvCell(e.actor.email),
          csvCell(e.createdAt.toISOString()),
        ].join(",")
      );
    }
    sendCsv(res, "audit-log.csv", lines);
  })
);

resultRouter.get(
  "/dashboard",
  requireStaffRead,
  asyncHandler(async (req, res) => {
    const orgId = req.user!.orgId;
    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [
      tests,
      published,
      invitations,
      completed,
      inProgress,
      questions,
      closingSoon,
      integrityAgg,
      questionsByTypeRaw,
      invitationsByStatusRaw,
    ] = await Promise.all([
        prisma.test.count({ where: { orgId, status: { not: "archived" } } }),
        prisma.test.count({ where: { orgId, status: "published" } }),
        prisma.invitation.count({ where: { test: { orgId }, isPreview: false } }),
        prisma.testSession.count({
          where: { test: { orgId }, status: { in: ["submitted", "auto_submitted"] }, isPreview: false },
        }),
        prisma.testSession.count({ where: { test: { orgId }, status: "in_progress", isPreview: false } }),
        prisma.question.count({ where: { orgId, isArchived: false, supersededById: null } }),
        prisma.test.count({
          where: { orgId, status: "published", schedulingEnd: { gte: new Date(), lte: sevenDaysOut } },
        }),
        prisma.testSession.aggregate({
          where: {
            test: { orgId },
            status: { in: ["submitted", "auto_submitted"] },
            integrityScore: { not: null },
            isPreview: false,
          },
          _avg: { integrityScore: true },
        }),
        // Further breakdown of the already-exposed `questions` count above —
        // not a new information surface, just a groupBy of the same set.
        prisma.question.groupBy({
          by: ["type"],
          where: { orgId, isArchived: false, supersededById: null },
          _count: { _all: true },
        }),
        // Same for `invitations`/`completed`/`inProgress` above — a status
        // breakdown of the same rows already counted in aggregate.
        prisma.invitation.groupBy({
          by: ["status"],
          where: { test: { orgId }, isPreview: false },
          _count: { _all: true },
        }),
      ]);
    const avgIntegrityScore = integrityAgg._avg.integrityScore;
    const questionsByType = Object.fromEntries(questionsByTypeRaw.map((r) => [r.type, r._count._all]));
    const invitationsByStatus = Object.fromEntries(invitationsByStatusRaw.map((r) => [r.status, r._count._all]));
    // The dashboard itself is deliberately ungated (every staff account's
    // universal landing page — see integrity.routes.ts's own comment on why
    // this route isn't behind requirePermission), but this one aggregate is
    // derived from integrity-timeline data that IS permission-gated
    // elsewhere (integrity.routes.ts requires "integrity" per-route). A
    // questions-only account shouldn't learn the org's average integrity
    // score just by loading the page everyone lands on.
    const canSeeIntegrity =
      req.user!.role === "super_admin" || req.user!.permissions.length === 0 || req.user!.permissions.includes("integrity");
    res.json({
      stats: {
        tests,
        published,
        invitations,
        completed,
        inProgress,
        questions,
        closingSoon,
        avgIntegrityScore: canSeeIntegrity && avgIntegrityScore != null ? Math.round(avgIntegrityScore) : null,
      },
      questionsByType,
      invitationsByStatus,
    });
  })
);

resultRouter.get(
  "/tests/:testId/results",
  requireStaffRead,
  requirePermission("results"),
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findFirst({
      where: { id: req.params.testId, orgId: req.user!.orgId },
    });
    if (!test) throw notFound("Test not found");

    const sessions = await prisma.testSession.findMany({
      where: { testId: test.id, isPreview: false },
      include: { submissions: { where: { isFinal: true } } },
      orderBy: { createdAt: "desc" },
    });
    const invitationCounts = await prisma.invitation.groupBy({
      by: ["status"],
      where: { testId: test.id, isPreview: false },
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
        shortlisted: s.shortlisted,
        tags: s.tags,
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
  requirePermission("results"),
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

    const breakdown = await Promise.all(
      order
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(async (entry) => {
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
            // Recruiters see the full answer key; candidates never receive this.
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
                  judgeResults: await Promise.all(
                    finalSub.judgeResults.map(async (jr) => ({
                      verdict: jr.verdict,
                      passed: jr.passed,
                      stdout: jr.stdout,
                      stderr: jr.stderr,
                      compileOutput: jr.compileOutput,
                      timeMs: jr.timeMs,
                      memoryKb: jr.memoryKb,
                      testCase: jr.testCase,
                      // Phase 3: presign any image keys in metadata for the UI.
                      metadata: await presignMetadata(jr.metadata),
                    }))
                  ),
                }
              : null,
            totalVersions: subs.length,
            draft:
              !finalSub && draft
                ? { content: draft.content, language: draft.language, updatedAt: draft.updatedAt }
                : null,
          };
        })
    );

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
        shortlisted: session.shortlisted,
        tags: session.tags,
      },
      test: session.test,
      totals,
      breakdown,
    });
  })
);

/**
 * Permanently remove a candidate from a test (recruiter data-cleanup
 * control). Deletes their invitation, which cascades at the DB level to the
 * session, drafts, submissions, judge results, proctoring events, review
 * notes, and plagiarism reports (schema.prisma's onDelete: Cascade chain).
 * Media in object storage (webcam snapshots, visual-diff/repo screenshots)
 * is deleted first, best-effort, since cascading the DB row alone doesn't
 * touch S3. The shared reference-design screenshot (`referenceKey`) is never
 * touched here: it belongs to the question, not this candidate, and is
 * reused for every other candidate on it.
 */
resultRouter.delete(
  "/tests/:testId/sessions/:sessionId",
  requireStaffWrite,
  requirePermission("results"),
  asyncHandler(async (req, res) => {
    const session = await prisma.testSession.findFirst({
      where: { id: req.params.sessionId, testId: req.params.testId, test: { orgId: req.user!.orgId } },
      select: { id: true, invitationId: true, candidateEmail: true, candidateName: true },
    });
    if (!session) throw notFound("Session not found");

    const [events, judgeResults] = await Promise.all([
      prisma.proctoringEvent.findMany({ where: { sessionId: session.id }, select: { metadata: true } }),
      prisma.judgeResult.findMany({
        where: { submission: { sessionId: session.id } },
        select: { metadata: true },
      }),
    ]);

    const keys = new Set<string>();
    for (const e of events) {
      const key = (e.metadata as Record<string, unknown> | null)?.key;
      if (typeof key === "string") keys.add(key);
    }
    for (const jr of judgeResults) {
      const m = (jr.metadata as Record<string, unknown> | null) ?? {};
      for (const field of ["candidateKey", "diffKey", "key"]) {
        const v = m[field];
        if (typeof v === "string") keys.add(v);
      }
      // referenceKey deliberately excluded: shared across every candidate on this question.
    }
    for (const key of keys) {
      await deleteObject(key).catch((err) => logger.error({ err, key }, "candidate delete: media cleanup failed"));
    }

    await prisma.invitation.delete({ where: { id: session.invitationId } });
    await audit(req.user!.orgId, req.user!.id, "candidate.delete", "invitation", session.invitationId, {
      candidateEmail: session.candidateEmail,
      candidateName: session.candidateName,
      testId: req.params.testId,
    });
    await notifyResultsReadyIfComplete(req.params.testId).catch(() => undefined);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Cohort analytics (spec 3.8)
// ---------------------------------------------------------------------------

resultRouter.get(
  "/tests/:testId/analytics",
  requireStaffRead,
  requirePermission("analytics"),
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findFirst({
      where: { id: req.params.testId, orgId: req.user!.orgId },
    });
    if (!test) throw notFound("Test not found");

    const sessions = await prisma.testSession.findMany({
      where: { testId: test.id, status: { in: ["submitted", "auto_submitted"] }, isPreview: false },
      include: { submissions: { where: { isFinal: true } } },
    });

    // Score distribution: 10 buckets of 10% each.
    const buckets = Array.from({ length: 10 }, () => 0);
    for (const s of sessions) {
      const { totalScore, maxScore } = sessionTotals(s);
      if (maxScore <= 0) continue;
      const pct = Math.min(100, Math.max(0, (totalScore / maxScore) * 100));
      buckets[Math.min(9, Math.floor(pct / 10))]++;
    }

    // Per-question stats: attempt rate, average score %, pass rate (>=60%), avg time spent.
    const questionIds = new Set<string>();
    for (const s of sessions) for (const o of getQuestionOrder(s)) questionIds.add(o.questionId);
    const questions = await prisma.question.findMany({ where: { id: { in: [...questionIds] } } });
    const qById = new Map(questions.map((q) => [q.id, q]));

    const perQuestion = [...questionIds].map((questionId) => {
      const q = qById.get(questionId);
      let attempts = 0;
      let scoreSum = 0;
      let scoreMaxSum = 0;
      let passCount = 0;
      let timeSum = 0;
      let timeCount = 0;
      for (const s of sessions) {
        const entry = getQuestionOrder(s).find((o) => o.questionId === questionId);
        if (!entry) continue;
        const sub = s.submissions.find((x) => x.questionId === questionId);
        if (!sub) continue;
        attempts++;
        const score = effectiveScore(sub);
        scoreSum += score;
        scoreMaxSum += entry.points;
        if (entry.points > 0 && score / entry.points >= 0.6) passCount++;
        if (s.startedAt && sub.submittedAt) {
          timeSum += (sub.submittedAt.getTime() - s.startedAt.getTime()) / 60_000;
          timeCount++;
        }
      }
      return {
        questionId,
        title: q?.title ?? "(deleted question)",
        type: q?.type ?? "dsa",
        attempts,
        cohortSize: sessions.length,
        avgScorePct: scoreMaxSum > 0 ? Math.round((scoreSum / scoreMaxSum) * 1000) / 10 : null,
        passRatePct: attempts > 0 ? Math.round((passCount / attempts) * 1000) / 10 : null,
        avgTimeSpentMinutes: timeCount > 0 ? Math.round((timeSum / timeCount) * 10) / 10 : null,
      };
    });

    const completeTimes = sessions
      .filter((s) => s.startedAt && s.submittedAt)
      .map((s) => (s.submittedAt!.getTime() - s.startedAt!.getTime()) / 60_000);

    res.json({
      cohortSize: sessions.length,
      scoreDistribution: buckets.map((count, i) => ({ bucketStartPct: i * 10, count })),
      avgTimeToCompleteMinutes:
        completeTimes.length > 0
          ? Math.round((completeTimes.reduce((a, b) => a + b, 0) / completeTimes.length) * 10) / 10
          : null,
      perQuestion,
    });
  })
);

// ---------------------------------------------------------------------------
// CSV / PDF export (spec 3.8: "offline sharing with a hiring panel")
// ---------------------------------------------------------------------------

async function loadResultRows(testId: string, orgId: string) {
  const test = await prisma.test.findFirst({ where: { id: testId, orgId } });
  if (!test) throw notFound("Test not found");
  const sessions = await prisma.testSession.findMany({
    where: { testId: test.id, isPreview: false },
    include: { submissions: { where: { isFinal: true } } },
    orderBy: { createdAt: "desc" },
  });
  return {
    test,
    rows: sessions.map((s) => {
      const { totalScore, maxScore } = sessionTotals(s);
      return {
        name: s.candidateName,
        email: s.candidateEmail,
        status: s.status,
        score: totalScore,
        maxScore,
        integrityScore: s.integrityScore,
        shortlisted: s.shortlisted,
        tags: s.tags.join("; "),
        startedAt: s.startedAt,
        submittedAt: s.submittedAt,
        timeTakenMinutes:
          s.startedAt && s.submittedAt
            ? Math.round((s.submittedAt.getTime() - s.startedAt.getTime()) / 60_000)
            : null,
      };
    }),
  };
}

resultRouter.get(
  "/tests/:testId/results/export.csv",
  requireStaffRead,
  requirePermission("results"),
  asyncHandler(async (req, res) => {
    const { test, rows } = await loadResultRows(req.params.testId, req.user!.orgId);
    const header = [
      "Name", "Email", "Status", "Score", "Max score", "Integrity score",
      "Shortlisted", "Tags", "Started at", "Submitted at", "Time taken (min)",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.name), csvCell(r.email), csvCell(r.status), csvCell(r.score), csvCell(r.maxScore),
          csvCell(r.integrityScore), csvCell(r.shortlisted), csvCell(r.tags),
          csvCell(r.startedAt?.toISOString()), csvCell(r.submittedAt?.toISOString()),
          csvCell(r.timeTakenMinutes),
        ].join(",")
      );
    }
    const filename = `${test.title.replace(/[^\w.-]+/g, "_")}-results.csv`;
    sendCsv(res, filename, lines);
  })
);

resultRouter.get(
  "/tests/:testId/results/export.pdf",
  requireStaffRead,
  requirePermission("results"),
  asyncHandler(async (req, res) => {
    const { test, rows } = await loadResultRows(req.params.testId, req.user!.orgId);
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, Arial, sans-serif; padding: 24px; color: #1e293b; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p.meta { color: #64748b; font-size: 11px; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #e2e8f0; padding: 5px 7px; text-align: left; }
      th { background: #f8fafc; }
    </style></head><body>
      <h1>${escapeHtml(test.title)}: results</h1>
      <p class="meta">Exported ${new Date().toISOString()} · ${rows.length} candidate(s)</p>
      <table><thead><tr>
        <th>Name</th><th>Email</th><th>Status</th><th>Score</th><th>Integrity</th>
        <th>Shortlisted</th><th>Tags</th><th>Time taken</th><th>Submitted</th>
      </tr></thead><tbody>
        ${rows
          .map(
            (r) => `<tr>
              <td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.email)}</td><td>${escapeHtml(r.status)}</td>
              <td>${r.score}/${r.maxScore}</td><td>${r.integrityScore ?? "-"}</td>
              <td>${r.shortlisted ? "Yes" : ""}</td><td>${escapeHtml(r.tags)}</td>
              <td>${r.timeTakenMinutes != null ? r.timeTakenMinutes + " min" : "-"}</td>
              <td>${r.submittedAt ? r.submittedAt.toISOString() : "-"}</td>
            </tr>`
          )
          .join("")}
      </tbody></table>
    </body></html>`;

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "A4", margin: { top: "16px", bottom: "16px" } });
      const filename = `${test.title.replace(/[^\w.-]+/g, "_")}-results.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdf);
    } finally {
      await browser.close();
    }
  })
);

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// ---------------------------------------------------------------------------
// Candidate triage: shortlist / tag (spec 3.8 bulk actions)
// ---------------------------------------------------------------------------

resultRouter.post(
  "/tests/:testId/sessions/bulk",
  requireStaffWrite,
  requirePermission("results"),
  validateBody(
    z.object({
      sessionIds: z.array(z.string().min(1)).min(1).max(500),
      action: z.enum(["shortlist", "unshortlist", "addTag", "removeTag"]),
      tag: z.string().min(1).max(40).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { sessionIds, action, tag } = req.body as {
      sessionIds: string[];
      action: "shortlist" | "unshortlist" | "addTag" | "removeTag";
      tag?: string;
    };
    if ((action === "addTag" || action === "removeTag") && !tag) {
      throw badRequest("tag is required for addTag/removeTag");
    }
    const sessions = await prisma.testSession.findMany({
      where: { id: { in: sessionIds }, test: { orgId: req.user!.orgId, id: req.params.testId } },
    });
    for (const s of sessions) {
      if (action === "shortlist") {
        await prisma.testSession.update({ where: { id: s.id }, data: { shortlisted: true } });
      } else if (action === "unshortlist") {
        await prisma.testSession.update({ where: { id: s.id }, data: { shortlisted: false } });
      } else if (action === "addTag") {
        if (!s.tags.includes(tag!)) {
          await prisma.testSession.update({ where: { id: s.id }, data: { tags: [...s.tags, tag!] } });
        }
      } else {
        await prisma.testSession.update({
          where: { id: s.id },
          data: { tags: s.tags.filter((t) => t !== tag) },
        });
      }
    }
    res.json({ updated: sessions.length });
  })
);

// ---------------------------------------------------------------------------
// Reviewer rubric (spec 3.7: manual sliders alongside automated sub-scores)
// ---------------------------------------------------------------------------

resultRouter.get(
  "/sessions/:sessionId/review-notes",
  requireStaffRead,
  requirePermission("results"),
  asyncHandler(async (req, res) => {
    const session = await prisma.testSession.findFirst({
      where: { id: req.params.sessionId, test: { orgId: req.user!.orgId } },
    });
    if (!session) throw notFound("Session not found");
    const notes = await prisma.reviewNote.findMany({
      where: { sessionId: session.id },
      include: { reviewer: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    });
    res.json({
      rubric: DEFAULT_MANUAL_RUBRIC,
      notes: notes.map((n) => ({
        id: n.id,
        reviewerName: n.reviewer.name,
        rubricScores: n.rubricScores,
        note: n.note,
        updatedAt: n.updatedAt,
      })),
    });
  })
);

resultRouter.put(
  "/sessions/:sessionId/review-notes",
  requireStaffWrite,
  requirePermission("results"),
  validateBody(z.object({ rubricScores: rubricScoresSchema.default({}), note: z.string().max(5_000).default("") })),
  asyncHandler(async (req, res) => {
    const session = await prisma.testSession.findFirst({
      where: { id: req.params.sessionId, test: { orgId: req.user!.orgId } },
    });
    if (!session) throw notFound("Session not found");
    const { rubricScores, note } = req.body as { rubricScores: Record<string, number>; note: string };
    const saved = await prisma.reviewNote.upsert({
      where: { sessionId_reviewerId: { sessionId: session.id, reviewerId: req.user!.id } as never },
      create: {
        sessionId: session.id,
        reviewerId: req.user!.id,
        rubricScores: rubricScores as Prisma.InputJsonValue,
        note,
      },
      update: { rubricScores: rubricScores as Prisma.InputJsonValue, note },
    });
    res.json({ id: saved.id, rubricScores: saved.rubricScores, note: saved.note, updatedAt: saved.updatedAt });
  })
);

// ---------------------------------------------------------------------------
// Recruiter-team notes: an unbounded freeform timeline on a candidate's
// session, any staff member, any number of entries — distinct from the
// rubric-scoring ReviewNote above (one row per reviewer).
// ---------------------------------------------------------------------------

resultRouter.get(
  "/sessions/:sessionId/notes",
  requireStaffRead,
  requirePermission("results"),
  asyncHandler(async (req, res) => {
    const session = await prisma.testSession.findFirst({
      where: { id: req.params.sessionId, test: { orgId: req.user!.orgId } },
    });
    if (!session) throw notFound("Session not found");
    const notes = await prisma.sessionNote.findMany({
      where: { sessionId: session.id },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      notes: notes.map((n) => ({
        id: n.id,
        authorName: n.author.name,
        body: n.body,
        createdAt: n.createdAt,
      })),
    });
  })
);

resultRouter.post(
  "/sessions/:sessionId/notes",
  requireStaffWrite,
  requirePermission("results"),
  validateBody(z.object({ body: z.string().min(1).max(5_000) })),
  asyncHandler(async (req, res) => {
    const session = await prisma.testSession.findFirst({
      where: { id: req.params.sessionId, test: { orgId: req.user!.orgId } },
    });
    if (!session) throw notFound("Session not found");
    const note = await prisma.sessionNote.create({
      data: { sessionId: session.id, authorId: req.user!.id, body: (req.body as { body: string }).body },
      include: { author: { select: { name: true } } },
    });
    res.status(201).json({ id: note.id, authorName: note.author.name, body: note.body, createdAt: note.createdAt });
  })
);

/** Manual score override: always kept separate from the automated score. */
resultRouter.patch(
  "/submissions/:submissionId/score",
  requireStaffWrite,
  requirePermission("results"),
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
    await audit(req.user!.orgId, req.user!.id, "score.override", "submission", submission.id, {
      previousManualScore: submission.manualScore,
      manualScore,
      autoScore: submission.autoScore,
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
