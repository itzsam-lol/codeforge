import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { executeCases } from "../lib/executor";
import { UnsupportedDevLanguageError } from "../lib/dockerExecutor";
import { parseArenaCodingConfig, type ArenaCodingConfig } from "./arenaSettings";
import { awardBadgesForSubmission } from "./arenaBadges";

interface ContestCachePayload {
  questions: { contestQuestionId: string; typeConfig: unknown; points: number }[];
}

async function resolveConfigAndMaxPoints(
  sub: { mode: string; contestId: string | null; contestQuestionId: string | null; practiceProblemId: string | null }
): Promise<{ cfg: ArenaCodingConfig; maxPoints: number } | null> {
  if (sub.mode === "practice") {
    if (!sub.practiceProblemId) return null;
    const problem = await prisma.arenaPracticeProblem.findUnique({ where: { id: sub.practiceProblemId } });
    if (!problem) return null;
    const cfg = parseArenaCodingConfig(problem.typeConfig);
    return cfg ? { cfg, maxPoints: 100 } : null;
  }

  if (!sub.contestId || !sub.contestQuestionId) return null;
  const cache = await prisma.arenaContestCache.findUnique({ where: { contestId: sub.contestId } });
  if (!cache) return null;
  const payload = cache.payload as unknown as ContestCachePayload;
  const question = payload.questions.find((q) => q.contestQuestionId === sub.contestQuestionId);
  if (!question) return null;
  const cfg = parseArenaCodingConfig(question.typeConfig);
  return cfg ? { cfg, maxPoints: question.points } : null;
}

/** Weighted scoring, same shape as apps/api's computeDsaScore
 *  (services/grading.ts) — full partial credit, no all-or-nothing mode
 *  since Arena has no per-question "partial credit toggle" of its own. */
function computeScore(passed: boolean[], weights: number[], maxPoints: number): number {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return 0;
  let passedWeight = 0;
  passed.forEach((p, i) => {
    if (p) passedWeight += weights[i];
  });
  return Math.round((maxPoints * passedWeight) / totalWeight * 100) / 100;
}

/**
 * Grade one ArenaSubmission via the existing Judge0-backed executeCases
 * pipeline (same executor, same rate limiter, same circuit breaker as the
 * core product — no dedicated Arena throttling layer, per the locked-down
 * build scope). Runs inside the "grade" BullMQ worker under the
 * "grade-arena-submission" job name (jobs/processors.ts).
 */
export async function gradeArenaSubmission(submissionId: string): Promise<void> {
  const sub = await prisma.arenaSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) return;
  if (sub.status !== "pending") return; // idempotent re-delivery guard
  // Only coding submissions ever reach this queue — mcq is graded
  // synchronously at submit time (arenaSubmissions.routes.ts) and never
  // enqueued. language/code are optional at the schema level only because
  // ArenaSubmission is shared with mcq rows (which use selectedOptionIds
  // instead); a coding submission missing either is a data-integrity bug,
  // not a normal failure mode a candidate can trigger.
  if (!sub.language || sub.code == null) {
    await prisma.arenaSubmission.update({
      where: { id: sub.id },
      data: { status: "runtime_error", judge0Meta: { error: "Missing code or language" } },
    });
    return;
  }

  const resolved = await resolveConfigAndMaxPoints(sub);
  if (!resolved) {
    await prisma.arenaSubmission.update({
      where: { id: sub.id },
      data: { status: "runtime_error", judge0Meta: { error: "Problem configuration not found" } },
    });
    return;
  }
  const { cfg, maxPoints } = resolved;
  if (cfg.testCases.length === 0) {
    await prisma.arenaSubmission.update({
      where: { id: sub.id },
      data: { status: "runtime_error", judge0Meta: { error: "This problem has no test cases" } },
    });
    return;
  }

  try {
    const outcomes = await executeCases({
      languageId: sub.language,
      sourceCode: sub.code,
      cases: cfg.testCases.map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput })),
      timeLimitMs: cfg.timeLimitMs,
      memoryLimitKb: cfg.memoryLimitKb,
    });

    const allPassed = outcomes.every((o) => o.passed);
    const score = computeScore(
      outcomes.map((o) => o.passed),
      cfg.testCases.map((tc) => tc.weight),
      maxPoints
    );

    await prisma.arenaSubmission.update({
      where: { id: sub.id },
      data: {
        status: allPassed ? "accepted" : "wrong_answer",
        score,
        judge0Meta: {
          results: outcomes.map((o, i) => ({
            isHidden: cfg.testCases[i].isHidden,
            passed: o.passed,
            verdict: o.verdict,
            timeMs: o.timeMs,
            memoryKb: o.memoryKb,
            // Hidden test case I/O is never exposed back to the client.
            stdout: cfg.testCases[i].isHidden ? undefined : o.stdout,
            stderr: cfg.testCases[i].isHidden ? undefined : o.stderr,
          })),
        },
      },
    });

    if (sub.mode === "contest" && sub.participationId) {
      await recomputeParticipationScore(sub.participationId, sub.contestId!);
    }
    if (allPassed) {
      await recordAcceptedActivity(sub.userId, sub.mode, sub.contestId);
      await awardBadgesForSubmission(sub.userId, sub.contestId);
    }
    logger.info({ submissionId: sub.id, status: allPassed ? "accepted" : "wrong_answer" }, "arena submission graded");
  } catch (err) {
    if (err instanceof UnsupportedDevLanguageError) {
      await prisma.arenaSubmission.update({
        where: { id: sub.id },
        data: { status: "compile_error", judge0Meta: { error: err.message } },
      });
      return;
    }
    // Infra errors (Judge0 unavailable, breaker tripped, etc.) — let BullMQ retry.
    await prisma.arenaSubmission.update({ where: { id: sub.id }, data: { status: "pending" } });
    throw err;
  }
}

/** Best score per question in the contest, summed — matches the "points"
 *  scoring mode. icpc_penalty mode is future work (see plan's open
 *  decisions); points mode is what's wired end-to-end for v1. Exported: also
 *  called directly by arenaSubmissions.routes.ts's mcq path, which grades
 *  synchronously and never goes through gradeArenaSubmission above. */
export async function recomputeParticipationScore(participationId: string, contestId: string): Promise<void> {
  const accepted = await prisma.arenaSubmission.findMany({
    where: { participationId, mode: "contest", status: "accepted" },
    orderBy: { score: "desc" },
  });
  const bestByQuestion = new Map<string, number>();
  for (const s of accepted) {
    if (!s.contestQuestionId) continue;
    const current = bestByQuestion.get(s.contestQuestionId) ?? 0;
    if (s.score > current) bestByQuestion.set(s.contestQuestionId, s.score);
  }
  const total = [...bestByQuestion.values()].reduce((a, b) => a + b, 0);
  await prisma.arenaParticipation.update({
    where: { id: participationId },
    data: { score: total },
  });
  void contestId; // reserved for icpc_penalty mode's time-penalty computation
}

export async function recordAcceptedActivity(userId: string, mode: string, contestId: string | null): Promise<void> {
  await prisma.arenaActivity.create({
    data: { userId, type: "submission_accepted", metadata: { mode, contestId } },
  });
}
