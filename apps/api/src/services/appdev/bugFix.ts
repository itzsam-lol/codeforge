/**
 * Bug-fix challenge grading (spec type 4): candidate's edited files are
 * overlaid with the recruiter's hidden node:test suite and executed in a
 * network-less container. Score = tests passed / total (the suite must go
 * from failing to passing).
 */
import { round2, type BugFixConfig } from "@codeforge/shared";
import { execDocker, tail, withTempDir, writeFiles } from "../../lib/dockerUtil";

export interface BugFixTestResult {
  name: string;
  passed: boolean;
}

/** Parse top-level TAP lines from `node --test` output. */
export function parseTap(output: string): BugFixTestResult[] {
  const results: BugFixTestResult[] = [];
  for (const line of output.split("\n")) {
    // Top-level results only (subtests are indented).
    const m = /^(ok|not ok) \d+ - (.+?)(?: #.*)?$/.exec(line);
    if (m) results.push({ name: m[2].trim(), passed: m[1] === "ok" });
  }
  return results;
}

export async function runBugFixTests(
  candidateFiles: Record<string, string>,
  testFiles: Record<string, string>
): Promise<{ results: BugFixTestResult[]; output: string; crashed: boolean }> {
  return withTempDir(async (dir) => {
    await writeFiles(dir, { ...candidateFiles, ...testFiles });
    const run = await execDocker(
      [
        "run", "--rm",
        "--network", "none",
        "--memory", "256m", "--cpus", "1", "--pids-limit", "128",
        "--read-only", "--user", "65534:65534",
        "-v", `${dir}:/work:ro`, "-w", "/work",
        "node:20-alpine", "node", "--test", ...Object.keys(testFiles),
      ],
      { timeoutMs: 60_000 }
    );
    const output = `${run.stdout}\n${run.stderr}`;
    const results = parseTap(run.stdout);
    return { results, output: tail(output, 8_000), crashed: results.length === 0 };
  });
}

export async function gradeBugFix(
  submission: { id: string; content: string; maxPoints: number },
  cfg: BugFixConfig
): Promise<{ autoScore: number; rows: object[] }> {
  let files: Record<string, string>;
  try {
    const parsed = JSON.parse(submission.content) as { files?: Record<string, string> };
    files = parsed.files ?? {};
  } catch {
    throw new Error("Submission is not valid JSON ({files})");
  }
  // Candidates may only supply the paths the starter defined: no smuggling
  // extra files (e.g. a replacement test) into the container.
  const allowed = new Set(Object.keys(cfg.files));
  const candidateFiles: Record<string, string> = { ...cfg.files };
  for (const [p, content] of Object.entries(files)) {
    if (allowed.has(p)) candidateFiles[p] = content;
  }

  const { results, output, crashed } = await runBugFixTests(candidateFiles, cfg.hiddenTests);
  if (crashed) {
    return {
      autoScore: 0,
      rows: [
        {
          verdict: "runtime_error",
          passed: false,
          stderr: output,
          metadata: { kind: "test", name: "Test suite", detail: "suite crashed or produced no results" },
        },
      ],
    };
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    autoScore: round2((submission.maxPoints * passed) / results.length),
    rows: results.map((r) => ({
      verdict: r.passed ? "accepted" : "wrong_answer",
      passed: r.passed,
      metadata: { kind: "test", name: r.name },
    })),
  };
}
