import { round2, type ApiChallengeConfig, type BugFixConfig, type RepoConfig } from "@codeforge/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { executeCases } from "../lib/executor";
import { UnsupportedDevLanguageError } from "../lib/dockerExecutor";
import { parseDsaConfig, parseTestSettings, parseTypeConfig } from "./settings";

interface ResultRow {
  testCaseId?: string;
  judge0Token?: string | null;
  verdict: string;
  passed: boolean;
  stdout?: string | null;
  stderr?: string | null;
  compileOutput?: string | null;
  timeMs?: number | null;
  memoryKb?: number | null;
  metadata?: object;
}

async function saveResults(
  submissionId: string,
  rows: ResultRow[],
  autoScore: number | null
): Promise<void> {
  await prisma.$transaction([
    prisma.judgeResult.deleteMany({ where: { submissionId } }),
    prisma.judgeResult.createMany({
      data: rows.map((r) => ({
        submissionId,
        testCaseId: r.testCaseId,
        judge0Token: r.judge0Token ?? undefined,
        verdict: r.verdict,
        passed: r.passed,
        stdout: r.stdout,
        stderr: r.stderr,
        compileOutput: r.compileOutput,
        timeMs: r.timeMs,
        memoryKb: r.memoryKb,
        metadata: (r.metadata as Prisma.InputJsonValue) ?? undefined,
      })),
    }),
    prisma.submission.update({
      where: { id: submissionId },
      data: { status: "graded", autoScore, gradedAt: new Date(), errorMessage: null },
    }),
  ]);
}

/**
 * Grade one submission of ANY question type. Runs inside the BullMQ "grade"
 * worker; throws on infrastructure errors so BullMQ retries with backoff.
 * Scores are always computed server-side (spec Section 8).
 */
export async function gradeSubmission(submissionId: string): Promise<void> {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      question: { include: { testCases: { orderBy: { orderIndex: "asc" } } } },
      session: { include: { test: true } },
    },
  });
  if (!sub || sub.kind !== "submit") return;
  if (sub.status === "graded") return; // idempotent re-delivery guard

  await prisma.submission.update({ where: { id: sub.id }, data: { status: "running" } });

  try {
    switch (sub.question.type) {
      case "dsa": {
        const { autoScore, rows } = await gradeDsa(sub);
        await saveResults(sub.id, rows, autoScore);
        break;
      }
      case "frontend_ui": {
        const { gradeFrontendSubmission } = await import("./appdev/frontendGrading");
        const { autoScore, rows } = await gradeFrontendSubmission(sub, sub.question);
        await saveResults(sub.id, rows as ResultRow[], autoScore);
        break;
      }
      case "api_challenge": {
        const cfg = parseTypeConfig<ApiChallengeConfig>("api_challenge", sub.question.typeConfig);
        if (!cfg) throw new Error("Invalid api_challenge config");
        const { gradeApiChallenge } = await import("./appdev/apiChallenge");
        const { autoScore, rows } = await gradeApiChallenge(sub, sub.question, cfg);
        await saveResults(sub.id, rows as ResultRow[], autoScore);
        break;
      }
      case "bug_fix": {
        const cfg = parseTypeConfig<BugFixConfig>("bug_fix", sub.question.typeConfig);
        if (!cfg) throw new Error("Invalid bug_fix config");
        const { gradeBugFix } = await import("./appdev/bugFix");
        const { autoScore, rows } = await gradeBugFix(sub, cfg);
        await saveResults(sub.id, rows as ResultRow[], autoScore);
        break;
      }
      case "repo_project": {
        const cfg = parseTypeConfig<RepoConfig>("repo_project", sub.question.typeConfig);
        if (!cfg) throw new Error("Invalid repo_project config");
        const { gradeRepoProject } = await import("./appdev/repoProject");
        const { autoScore, rows } = await gradeRepoProject(sub, cfg);
        await saveResults(sub.id, rows as ResultRow[], autoScore);
        break;
      }
      default:
        return; // mcq never reaches the queue
    }
    logger.info({ submissionId: sub.id, type: sub.question.type }, "submission graded");
  } catch (err) {
    await prisma.submission.update({
      where: { id: sub.id },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Grading failed",
      },
    });
    // Retrying won't fix an unsupported language; infra errors get retried.
    if (err instanceof UnsupportedDevLanguageError) return;
    throw err; // let BullMQ retry
  }
}

type LoadedSubmission = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.submission.findUnique<{
        where: { id: string };
        include: {
          question: { include: { testCases: true } };
          session: { include: { test: true } };
        };
      }>
    >
  >
>;

async function gradeDsa(sub: LoadedSubmission): Promise<{ autoScore: number; rows: ResultRow[] }> {
  const testCases = sub.question.testCases;
  if (testCases.length === 0) throw new Error("Question has no test cases");

  const cfg = parseDsaConfig(sub.question.typeConfig);
  const outcomes = await executeCases({
    languageId: sub.language ?? "javascript",
    sourceCode: sub.content,
    cases: testCases.map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput })),
    timeLimitMs: cfg.timeLimitMs,
    memoryLimitKb: cfg.memoryLimitKb,
  });

  const totalWeight = testCases.reduce((s, tc) => s + tc.weight, 0);
  let passedWeight = 0;
  outcomes.forEach((o, i) => {
    if (o.passed) passedWeight += testCases[i].weight;
  });
  const settings = parseTestSettings(sub.session.test.settings);
  const autoScore = settings.partialCredit
    ? round2((sub.maxPoints * passedWeight) / totalWeight)
    : passedWeight === totalWeight
      ? sub.maxPoints
      : 0;

  return {
    autoScore,
    rows: outcomes.map((o, i) => ({
      testCaseId: testCases[i].id,
      judge0Token: o.token,
      verdict: o.verdict,
      passed: o.passed,
      stdout: o.stdout,
      stderr: o.stderr,
      compileOutput: o.compileOutput,
      timeMs: o.timeMs,
      memoryKb: o.memoryKb,
    })),
  };
}
