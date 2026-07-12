import {
  scoreMcq,
  type ApiChallengeConfig,
  type BugFixConfig,
  type CandidateQuestion,
  type FrontendConfig,
  type QuestionType,
} from "@codeforge/shared";
import type { Prisma, Question, TestCase, TestSession } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { parseDsaConfig, parseMcqConfig, parseTestSettings, parseTypeConfig } from "./settings";

export interface QuestionOrderEntry {
  questionId: string;
  points: number;
  order: number;
}

export function getQuestionOrder(session: TestSession): QuestionOrderEntry[] {
  return (session.questionOrder as unknown as QuestionOrderEntry[]) ?? [];
}

/**
 * Resolve the per-candidate question list at session start: fixed questions
 * plus a random pick from each pool slot, then optionally shuffled. The result
 * is frozen on the session so grading and review are reproducible.
 */
export async function resolveQuestionOrder(testId: string): Promise<QuestionOrderEntry[]> {
  const test = await prisma.test.findUniqueOrThrow({
    where: { id: testId },
    include: { questions: { orderBy: { orderIndex: "asc" }, include: { pool: true } } },
  });
  const settings = parseTestSettings(test.settings);

  const entries: QuestionOrderEntry[] = [];
  for (const tq of test.questions) {
    let questionId = tq.questionId;
    if (!questionId && tq.pool && tq.pool.questionIds.length > 0) {
      questionId = tq.pool.questionIds[Math.floor(Math.random() * tq.pool.questionIds.length)];
    }
    if (!questionId) continue;
    entries.push({ questionId, points: tq.points, order: entries.length });
  }

  if (settings.shuffleQuestions) {
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    entries.forEach((e, i) => (e.order = i));
  }
  return entries;
}

/** Strip answers/hidden cases from a question for the candidate UI. */
export function toCandidateQuestion(
  entry: QuestionOrderEntry,
  question: Question & { testCases: TestCase[] },
  globalAllowedLanguages: string[]
): CandidateQuestion {
  const base: CandidateQuestion = {
    questionId: question.id,
    order: entry.order,
    points: entry.points,
    type: question.type as QuestionType,
    title: question.title,
    bodyMd: question.bodyMd,
  };

  if (question.type === "dsa") {
    const cfg = parseDsaConfig(question.typeConfig);
    let languages = cfg.languages.length > 0 ? cfg.languages : undefined;
    if (globalAllowedLanguages.length > 0) {
      languages = (languages ?? globalAllowedLanguages).filter((l) =>
        globalAllowedLanguages.includes(l)
      );
    }
    base.languages = languages;
    base.starterCode = cfg.starterCode;
    base.timeLimitMs = cfg.timeLimitMs;
    base.memoryLimitKb = cfg.memoryLimitKb;
    base.sampleCases = question.testCases
      .filter((tc) => !tc.isHidden)
      .map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput }));
  }

  if (question.type === "mcq") {
    const cfg = parseMcqConfig(question.typeConfig);
    if (cfg) {
      base.options = cfg.options.map((o) => ({
        id: o.id,
        textMd: o.textMd,
        ...(o.imageUrl ? { imageUrl: o.imageUrl } : {}),
      }));
      base.multiple = cfg.multiple;
      base.hasNegativeMarking = cfg.negativeMarkingPct > 0;
    }
  }

  if (question.type === "frontend_ui") {
    const cfg = parseTypeConfig<FrontendConfig>("frontend_ui", question.typeConfig);
    if (cfg) {
      // Reference HTML/CSS never leaves the server; candidates only get the
      // rendered screenshots (URLs presigned by the /state route).
      base.starter = cfg.starter;
      base.breakpoints = cfg.breakpoints;
    }
  }

  if (question.type === "api_challenge") {
    const cfg = parseTypeConfig<ApiChallengeConfig>("api_challenge", question.typeConfig);
    if (cfg) {
      base.apiStarterCode = cfg.starterCode;
      base.apiPort = cfg.port;
      base.sampleHttpTests = cfg.httpTests
        .filter((t) => !t.isHidden)
        .map((t) => ({ name: t.name, method: t.method, path: t.path, expectStatus: t.expectStatus }));
    }
  }

  if (question.type === "bug_fix") {
    const cfg = parseTypeConfig<BugFixConfig>("bug_fix", question.typeConfig);
    if (cfg) {
      base.files = cfg.files;
      base.sampleTestNames = Object.keys(cfg.sampleTests);
    }
  }

  return base;
}

export function parseMcqDraft(content: string | undefined | null): string[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { selectedOptionIds?: unknown };
    if (Array.isArray(parsed.selectedOptionIds)) {
      return parsed.selectedOptionIds.filter((x): x is string => typeof x === "string");
    }
  } catch {
    /* malformed draft = unanswered */
  }
  return [];
}

/**
 * Finalize a session (candidate clicked Submit, the delayed auto-submit job
 * fired, or the sweeper found it expired). Idempotent: an atomic status claim
 * ensures exactly one caller finalizes even if the job and the candidate race.
 *
 * MCQ questions are scored inline (deterministic); the latest coding
 * submission per question becomes final, and un-submitted coding drafts are
 * promoted to submissions and queued for grading so work is never lost.
 */
export async function finalizeSession(
  sessionId: string,
  mode: "manual" | "auto"
): Promise<boolean> {
  const now = new Date();
  const claimed = await prisma.testSession.updateMany({
    where: { id: sessionId, status: "in_progress" },
    data: {
      status: mode === "auto" ? "auto_submitted" : "submitted",
      submittedAt: now,
    },
  });
  if (claimed.count === 0) return false; // already finalized elsewhere

  const session = await prisma.testSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { test: { include: { org: true } }, drafts: true, invitation: true },
  });
  const settings = parseTestSettings(session.test.settings);
  const order = getQuestionOrder(session);
  const questions = await prisma.question.findMany({
    where: { id: { in: order.map((o) => o.questionId) } },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));

  const gradeJobs: string[] = [];

  for (const entry of order) {
    const question = byId.get(entry.questionId);
    if (!question) continue;
    const draft = session.drafts.find((d) => d.questionId === entry.questionId);

    if (question.type === "mcq") {
      const cfg = parseMcqConfig(question.typeConfig);
      const selected = parseMcqDraft(draft?.content);
      const autoScore = cfg
        ? scoreMcq({
            config: cfg,
            selectedOptionIds: selected,
            points: entry.points,
            msqPartialCredit: settings.msqPartialCredit,
          })
        : 0;
      await prisma.submission.create({
        data: {
          sessionId,
          questionId: question.id,
          kind: "submit",
          content: JSON.stringify({ selectedOptionIds: selected }),
          version: 1,
          isFinal: true,
          status: "graded",
          autoScore,
          maxPoints: entry.points,
          gradedAt: now,
        },
      });
      continue;
    }

    // Every non-MCQ type: the latest explicit submission wins; otherwise the
    // autosaved draft is promoted and queued so timed-out work still grades.
    {
      const latest = await prisma.submission.findFirst({
        where: { sessionId, questionId: question.id, kind: "submit" },
        orderBy: { version: "desc" },
      });
      if (latest) {
        await prisma.$transaction([
          prisma.submission.updateMany({
            where: { sessionId, questionId: question.id, kind: "submit" },
            data: { isFinal: false },
          }),
          prisma.submission.update({ where: { id: latest.id }, data: { isFinal: true } }),
        ]);
        // Grading normally already ran on explicit submit; re-queue if it failed.
        if (latest.status === "failed" || latest.status === "queued") {
          gradeJobs.push(latest.id);
        }
      } else if (draft?.content?.trim()) {
        // Promote the autosaved draft so timed-out candidates still get graded.
        const created = await prisma.submission.create({
          data: {
            sessionId,
            questionId: question.id,
            kind: "submit",
            content: draft.content,
            language: draft.language,
            version: 1,
            isFinal: true,
            status: "queued",
            maxPoints: entry.points,
          },
        });
        gradeJobs.push(created.id);
      }
    }
  }

  await prisma.invitation.update({
    where: { id: session.invitationId },
    data: { status: "completed" },
  });

  // Phase 4: candidate confirmation + (once per test) recruiter results-ready.
  const { sendCandidateCompletionEmail } = await import("../lib/email");
  const { notifyResultsReadyIfComplete } = await import("./notifications");
  await sendCandidateCompletionEmail({
    to: session.candidateEmail,
    candidateName: session.candidateName,
    testTitle: session.test.title,
    orgName: session.test.org.name,
  }).catch((err) => logger.error({ err, sessionId }, "candidate completion email failed"));
  await notifyResultsReadyIfComplete(session.testId).catch((err) =>
    logger.error({ err, testId: session.testId }, "results-ready check failed")
  );

  // Deferred import avoids a queues<->session circular dependency.
  const { enqueueGradeSubmission, cancelAutoSubmit, enqueueScanSession } = await import(
    "../jobs/queues"
  );
  for (const id of gradeJobs) await enqueueGradeSubmission(id);
  if (mode === "manual") await cancelAutoSubmit(sessionId);

  // Phase 2: persist the final integrity score + queue the plagiarism scan.
  const { refreshSessionIntegrity } = await import("./integrity");
  await refreshSessionIntegrity(sessionId).catch((err) =>
    logger.error({ err, sessionId }, "integrity refresh failed")
  );
  await enqueueScanSession(sessionId).catch((err) =>
    logger.error({ err, sessionId }, "plagiarism enqueue failed")
  );

  logger.info({ sessionId, mode, gradeJobs: gradeJobs.length }, "session finalized");
  return true;
}

/** Safety net: finalize any in-progress session whose server deadline passed. */
export async function sweepExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 5_000);
  const expired = await prisma.testSession.findMany({
    where: { status: "in_progress", endsAt: { lt: cutoff } },
    select: { id: true },
  });
  for (const s of expired) {
    await finalizeSession(s.id, "auto").catch((err) =>
      logger.error({ err, sessionId: s.id }, "sweep finalize failed")
    );
  }
  return expired.length;
}

/** Effective score of a final submission (manual override wins). */
export function effectiveScore(sub: { autoScore: number | null; manualScore: number | null }) {
  return sub.manualScore ?? sub.autoScore ?? 0;
}

export type SessionWithFinals = Prisma.TestSessionGetPayload<{
  include: { submissions: true };
}>;

export function sessionTotals(session: SessionWithFinals): {
  totalScore: number;
  maxScore: number;
} {
  const order = getQuestionOrder(session);
  const maxScore = order.reduce((s, o) => s + o.points, 0);
  const totalScore = session.submissions
    .filter((s) => s.isFinal)
    .reduce((s, sub) => s + effectiveScore(sub), 0);
  return { totalScore: Math.round(totalScore * 100) / 100, maxScore };
}
