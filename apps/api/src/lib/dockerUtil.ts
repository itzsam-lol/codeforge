/**
 * Small helpers for orchestrating grading containers on the local Docker
 * daemon (API challenges, bug-fix suites, repo pipelines). All candidate
 * workloads run with CPU/memory/pids caps; API-challenge networks are created
 * `--internal` so candidate servers have no egress and no public exposure.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "./logger";

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function execDocker(args: string[], opts: { timeoutMs?: number } = {}): Promise<ExecResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  return new Promise((resolve) => {
    const child = spawn("docker", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const cap = (s: string, c: Buffer) => (s.length < 256_000 ? s + c.toString("utf8") : s);
    child.stdout.on("data", (c: Buffer) => (stdout = cap(stdout, c)));
    child.stderr.on("data", (c: Buffer) => (stderr = cap(stderr, c)));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: String(err), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

export function randomName(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cf-p3-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Write a map of relative-path -> content under `dir` (creates subfolders). */
export async function writeFiles(dir: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    // Path-traversal guard: keys come from recruiter/candidate JSON. The
    // trailing separator matters: without it, "../sibling-dir-with-same-
    // prefix/x" would pass a bare startsWith() check.
    const root = path.resolve(dir) + path.sep;
    const target = path.resolve(dir, rel);
    if (!target.startsWith(root)) {
      throw new Error(`Illegal file path: ${rel}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }
}

export async function removeContainer(name: string): Promise<void> {
  await execDocker(["rm", "-f", name], { timeoutMs: 20_000 }).catch(() => undefined);
}

export async function removeNetwork(name: string): Promise<void> {
  await execDocker(["network", "rm", name], { timeoutMs: 20_000 }).catch(() => undefined);
}

export function tail(s: string, max = 8_000): string {
  return s.length > max ? `... [truncated]\n${s.slice(-max)}` : s;
}

export function logStep(ctx: Record<string, unknown>, msg: string): void {
  logger.info(ctx, msg);
}
