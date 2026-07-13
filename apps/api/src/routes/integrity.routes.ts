import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { requireAuth, requireStaffRead, requireStaffWrite } from "../middleware/auth";
import { computeSessionIntegrity } from "../services/integrity";
import { presignGet } from "../lib/s3";
import { getQuestionOrder } from "../services/session";

/**
 * Phase 2 recruiter routes: integrity timeline + snapshots, session replay,
 * plagiarism reports. Reviewers get read access; only staff can trigger scans.
 */
export const integrityRouter = Router();
integrityRouter.use(requireAuth);

async function findOrgSession(sessionId: string, orgId: string) {
  const session = await prisma.testSession.findFirst({
    where: { id: sessionId, test: { orgId } },
  });
  if (!session) throw notFound("Session not found");
  return session;
}

// ---------------------------------------------------------------------------
// Integrity timeline
// ---------------------------------------------------------------------------

integrityRouter.get(
  "/sessions/:sessionId/integrity",
  requireStaffRead,
  asyncHandler(async (req, res) => {
    const session = await findOrgSession(req.params.sessionId, req.user!.orgId);
    const events = await prisma.proctoringEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    });
    const breakdown = await computeSessionIntegrity(session.id);

    const snapshots: { url: string; at: Date; facePresent: boolean | null; kind: string }[] = [];
    const timeline: { type: string; severity: number; metadata: unknown; createdAt: Date }[] = [];
    for (const e of events) {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      if (["webcam_snapshot", "identity_snapshot"].includes(e.eventType) && typeof meta.key === "string") {
        snapshots.push({
          url: await presignGet(meta.key),
          at: e.createdAt,
          facePresent: (meta.facePresent as boolean | null) ?? null,
          kind: (meta.kind as string) ?? "interval",
        });
        continue; // snapshots render as a gallery, not timeline noise
      }
      const { key: _key, ...safeMeta } = meta; // never leak raw storage keys
      timeline.push({
        type: e.eventType,
        severity: e.severity,
        metadata: safeMeta,
        createdAt: e.createdAt,
      });
    }

    res.json({
      integrity: breakdown, // { score, deductions }: a signal, not a verdict
      persistedScore: session.integrityScore,
      timeline,
      snapshots,
    });
  })
);

// ---------------------------------------------------------------------------
// Session replay
// ---------------------------------------------------------------------------

integrityRouter.get(
  "/sessions/:sessionId/replay/:questionId",
  requireStaffRead,
  asyncHandler(async (req, res) => {
    const session = await findOrgSession(req.params.sessionId, req.user!.orgId);
    const order = getQuestionOrder(session);
    if (!order.some((o) => o.questionId === req.params.questionId)) {
      throw notFound("Question is not part of this session");
    }
    const batches = await prisma.editorEventBatch.findMany({
      where: { sessionId: session.id, questionId: req.params.questionId },
      orderBy: { seq: "asc" },
      select: { seq: true, ops: true, createdAt: true },
    });
    res.json({ batches });
  })
);

// ---------------------------------------------------------------------------
// Plagiarism
// ---------------------------------------------------------------------------

integrityRouter.post(
  "/tests/:testId/plagiarism-scan",
  requireStaffWrite,
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findFirst({
      where: { id: req.params.testId, orgId: req.user!.orgId },
    });
    if (!test) throw notFound("Test not found");
    const submissions = await prisma.submission.count({
      where: {
        kind: "submit",
        isFinal: true,
        question: { type: "dsa" },
        session: { testId: test.id },
      },
    });
    if (submissions === 0) throw badRequest("No final coding submissions to scan yet");
    const { enqueueScanTest } = await import("../jobs/queues");
    await enqueueScanTest(test.id);
    res.status(202).json({ ok: true, submissions });
  })
);

integrityRouter.get(
  "/tests/:testId/plagiarism",
  requireStaffRead,
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findFirst({
      where: { id: req.params.testId, orgId: req.user!.orgId },
    });
    if (!test) throw notFound("Test not found");

    const reports = await prisma.plagiarismReport.findMany({
      where: { submission: { session: { testId: test.id } } },
      orderBy: { similarityPct: "desc" },
      take: 200,
      include: {
        submission: {
          select: {
            id: true,
            questionId: true,
            question: { select: { title: true } },
            session: { select: { id: true, candidateName: true, candidateEmail: true } },
          },
        },
        comparedSubmission: {
          select: {
            id: true,
            session: { select: { id: true, candidateName: true, candidateEmail: true } },
          },
        },
      },
    });

    // Candidate pairs appear twice (A→B and B→A after a full scan); keep the
    // higher-similarity direction of each unordered pair.
    const seen = new Set<string>();
    const rows = [];
    for (const r of reports) {
      const pairKey =
        r.kind === "candidate" && r.comparedSubmissionId
          ? [r.submissionId, r.comparedSubmissionId].sort().join("|")
          : r.id;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      rows.push({
        reportId: r.id,
        kind: r.kind,
        similarityPct: r.similarityPct,
        questionTitle: r.submission.question.title,
        a: {
          sessionId: r.submission.session.id,
          candidateName: r.submission.session.candidateName,
          candidateEmail: r.submission.session.candidateEmail,
        },
        b: r.comparedSubmission
          ? {
              sessionId: r.comparedSubmission.session.id,
              candidateName: r.comparedSubmission.session.candidateName,
              candidateEmail: r.comparedSubmission.session.candidateEmail,
            }
          : { referenceLabel: r.referenceLabel },
        createdAt: r.createdAt,
      });
    }
    res.json({ reports: rows });
  })
);

/** Full detail for the side-by-side diff view. */
integrityRouter.get(
  "/plagiarism/:reportId",
  requireStaffRead,
  asyncHandler(async (req, res) => {
    const report = await prisma.plagiarismReport.findFirst({
      where: {
        id: req.params.reportId,
        submission: { session: { test: { orgId: req.user!.orgId } } },
      },
      include: {
        submission: {
          select: {
            content: true,
            language: true,
            question: { select: { title: true, typeConfig: true } },
            session: { select: { candidateName: true } },
          },
        },
        comparedSubmission: {
          select: {
            content: true,
            language: true,
            session: { select: { candidateName: true } },
          },
        },
      },
    });
    if (!report) throw notFound("Report not found");

    // Reference matches compare against recruiter-authored corpus entries
    // stored in the question config, safe to show staff side-by-side.
    let referenceContent: string | null = null;
    if (report.kind === "reference") {
      const { parseDsaConfig } = await import("../services/settings");
      const cfg = parseDsaConfig(report.submission.question.typeConfig);
      referenceContent =
        cfg.referenceSolutions.find((r) => r.label === report.referenceLabel)?.code ?? null;
    }
    res.json({
      report: {
        id: report.id,
        kind: report.kind,
        similarityPct: report.similarityPct,
        matchedRanges: report.matchedRanges,
        questionTitle: report.submission.question.title,
        a: {
          name: report.submission.session.candidateName,
          content: report.submission.content,
          language: report.submission.language,
        },
        b: report.comparedSubmission
          ? {
              name: report.comparedSubmission.session.candidateName,
              content: report.comparedSubmission.content,
              language: report.comparedSubmission.language,
            }
          : {
              name: report.referenceLabel ?? "Reference solution",
              content: referenceContent,
              language: report.submission.language,
            },
      },
    });
  })
);
