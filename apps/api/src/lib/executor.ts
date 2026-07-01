/**
 * Execution dispatch: EXECUTOR=judge0 (production default, isolate sandbox)
 * or EXECUTOR=docker (local-dev fallback for hosts where Judge0's cgroup-v1
 * requirement can't be met — see lib/dockerExecutor.ts and SECURITY.md).
 */
import { config } from "../config";
import { judge0Healthy, runCases, type CaseOutcome, type RunCaseInput } from "./judge0";
import { dockerExecutorHealthy, dockerRunCases } from "./dockerExecutor";

export interface ExecuteOptions {
  languageId: string;
  sourceCode: string;
  cases: RunCaseInput[];
  timeLimitMs: number;
  memoryLimitKb: number;
}

export async function executeCases(opts: ExecuteOptions): Promise<CaseOutcome[]> {
  if (config.executor === "docker") return dockerRunCases(opts);
  return runCases(opts);
}

export async function executorHealthy(): Promise<{ executor: string; healthy: boolean }> {
  const healthy =
    config.executor === "docker" ? await dockerExecutorHealthy() : await judge0Healthy();
  return { executor: config.executor, healthy };
}
