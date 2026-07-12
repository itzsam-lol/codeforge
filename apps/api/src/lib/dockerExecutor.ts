/**
 * DEV-ONLY fallback executor (EXECUTOR=docker): runs candidate code in
 * ephemeral, hardened Docker containers on the local daemon.
 *
 * Exists because Judge0's isolate sandbox needs cgroup-v1 memory controllers,
 * which recent WSL2/Linux kernels (6.12+) no longer ship, so local dev on
 * Docker Desktop can't run Judge0 workers. Production should always use
 * Judge0 on a Linux host (see SECURITY.md).
 *
 * Isolation per run: --network none, memory/cpu/pids limits, read-only
 * rootfs (+ small exec tmpfs for compilers), non-root user, wall-clock kill.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CaseOutcome, RunCaseInput } from "./judge0";
import { logger } from "./logger";

export class UnsupportedDevLanguageError extends Error {
  constructor(languageId: string) {
    super(
      `Language "${languageId}" is not supported by the local dev executor ` +
        `(supported: ${Object.keys(LANGS).join(", ")}). Use Judge0 in production.`
    );
  }
}

interface LangSpec {
  image: string;
  file: string;
  cmd: string[];
  /** compilers need extra wall-clock allowance */
  compiled?: boolean;
}

const LANGS: Record<string, LangSpec> = {
  javascript: {
    image: "node:20-alpine",
    file: "main.js",
    cmd: ["node", "/sandbox/main.js"],
  },
  python: {
    image: "python:3.12-alpine",
    file: "main.py",
    cmd: ["python", "/sandbox/main.py"],
  },
  cpp: {
    image: "gcc:13",
    file: "main.cpp",
    cmd: ["sh", "-c", "g++ -O2 -o /tmp/prog /sandbox/main.cpp 2>&1 && /tmp/prog"],
    compiled: true,
  },
  c: {
    image: "gcc:13",
    file: "main.c",
    cmd: ["sh", "-c", "gcc -O2 -o /tmp/prog /sandbox/main.c 2>&1 && /tmp/prog"],
    compiled: true,
  },
  java: {
    image: "eclipse-temurin:21",
    file: "Main.java",
    cmd: [
      "sh",
      "-c",
      "cp /sandbox/Main.java /tmp/ && cd /tmp && javac Main.java 2>&1 && java -XX:MaxRAMPercentage=75 Main",
    ],
    compiled: true,
  },
};

/** Judge0-style comparison: ignore trailing whitespace per line + trailing newlines. */
function normalize(s: string): string {
  return s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

export async function dockerExecutorHealthy(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("docker", ["version", "--format", "{{.Server.Version}}"]);
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

export async function dockerRunCases(opts: {
  languageId: string;
  sourceCode: string;
  cases: RunCaseInput[];
  timeLimitMs: number;
  memoryLimitKb: number;
}): Promise<CaseOutcome[]> {
  const spec = LANGS[opts.languageId];
  if (!spec) throw new UnsupportedDevLanguageError(opts.languageId);
  if (opts.cases.length === 0) return [];

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cf-exec-"));
  await fs.writeFile(path.join(dir, spec.file), opts.sourceCode, "utf8");

  try {
    // Small pool: container startup dominates, but unbounded parallelism
    // would stampede the local daemon.
    const results: CaseOutcome[] = new Array(opts.cases.length);
    const poolSize = 3;
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(poolSize, opts.cases.length) }, async () => {
        while (next < opts.cases.length) {
          const i = next++;
          results[i] = await runOne(spec, dir, opts.cases[i], opts.timeLimitMs, opts.memoryLimitKb);
        }
      })
    );
    return results;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runOne(
  spec: LangSpec,
  dir: string,
  testCase: RunCaseInput,
  timeLimitMs: number,
  memoryLimitKb: number
): Promise<CaseOutcome> {
  const memoryMb = Math.max(32, Math.ceil(memoryLimitKb / 1024));
  const wallBudgetMs = timeLimitMs + (spec.compiled ? 30_000 : 5_000);
  const args = [
    "run",
    "--rm",
    "-i",
    "--network",
    "none",
    "--memory",
    `${memoryMb}m`,
    "--cpus",
    "1",
    "--pids-limit",
    "128",
    "--read-only",
    "--tmpfs",
    "/tmp:exec,mode=1777,size=256m",
    "--user",
    spec.compiled ? "1000:1000" : "65534:65534",
    "-v",
    `${dir}:/sandbox:ro`,
    spec.image,
    ...spec.cmd,
  ];

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("docker", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const cap = (s: string, chunk: Buffer) =>
      s.length < 64_000 ? s + chunk.toString("utf8") : s;

    child.stdout.on("data", (c: Buffer) => (stdout = cap(stdout, c)));
    child.stderr.on("data", (c: Buffer) => (stderr = cap(stderr, c)));

    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, wallBudgetMs);

    child.on("error", (err) => {
      clearTimeout(killTimer);
      logger.error({ err }, "dev executor: failed to spawn docker");
      resolve({
        token: null,
        verdict: "internal_error",
        passed: false,
        stdout: null,
        stderr: "Local dev executor could not start a container",
        compileOutput: null,
        timeMs: null,
        memoryKb: null,
      });
    });

    child.on("close", (code) => {
      clearTimeout(killTimer);
      const timeMs = Date.now() - started;
      if (timedOut) {
        resolve({
          token: null,
          verdict: "time_limit_exceeded",
          passed: false,
          stdout: stdout || null,
          stderr: stderr || null,
          compileOutput: null,
          timeMs,
          memoryKb: null,
        });
        return;
      }
      if (code !== 0) {
        // 137 = SIGKILL, typically the OOM killer given our --memory cap.
        const compileFailed = spec.compiled && !stdout && (stderr || code === 1);
        resolve({
          token: null,
          verdict:
            code === 137
              ? "memory_limit_exceeded"
              : compileFailed
                ? "compile_error"
                : "runtime_error",
          passed: false,
          stdout: stdout || null,
          stderr: stderr || `Process exited with code ${code}`,
          compileOutput: compileFailed ? stdout + stderr || null : null,
          timeMs,
          memoryKb: null,
        });
        return;
      }
      const passed = normalize(stdout) === normalize(testCase.expectedOutput);
      resolve({
        token: null,
        verdict: passed ? "accepted" : "wrong_answer",
        passed,
        stdout: stdout || null,
        stderr: stderr || null,
        compileOutput: null,
        timeMs,
        memoryKb: null,
      });
    });

    child.stdin.on("error", () => undefined); // process may exit before stdin drains
    child.stdin.write(testCase.input.endsWith("\n") ? testCase.input : testCase.input + "\n");
    child.stdin.end();
  });
}
