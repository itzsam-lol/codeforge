import { languageById, type Verdict } from "@codeforge/shared";
import { config } from "../config";
import { logger } from "./logger";

/**
 * Thin client for a self-hosted Judge0 CE instance.
 * All payloads are base64-encoded to survive arbitrary bytes in code/stdin.
 * Candidate code only ever executes inside Judge0's isolate sandbox — never here.
 */

export class Judge0UnavailableError extends Error {
  constructor(msg = "Code execution engine is unavailable") {
    super(msg);
  }
}

export interface RunCaseInput {
  input: string;
  expectedOutput: string;
}

export interface CaseOutcome {
  token: string | null;
  verdict: Verdict;
  passed: boolean;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  timeMs: number | null;
  memoryKb: number | null;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string | null | undefined): string | null =>
  s == null ? null : Buffer.from(s, "base64").toString("utf8");

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.judge0AuthToken) h["X-Auth-Token"] = config.judge0AuthToken;
  return h;
}

function mapVerdict(statusId: number): Verdict {
  switch (statusId) {
    case 1:
    case 2:
      return "pending";
    case 3:
      return "accepted";
    case 4:
      return "wrong_answer";
    case 5:
      return "time_limit_exceeded";
    case 6:
      return "compile_error";
    case 7:
    case 8:
    case 9:
    case 10:
    case 11:
    case 12:
      return "runtime_error";
    default:
      return "internal_error";
  }
}

interface RawResult {
  token: string;
  status: { id: number; description: string } | null;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null; // seconds
  memory: number | null; // KB
}

async function judge0Fetch(pathname: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${config.judge0Url}${pathname}`, {
      ...init,
      headers: { ...headers(), ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.warn({ err, pathname }, "judge0 unreachable");
    throw new Judge0UnavailableError();
  }
}

export async function judge0Healthy(): Promise<boolean> {
  try {
    const res = await judge0Fetch("/languages");
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Execute `sourceCode` against each test case and wait for the verdicts.
 * Judge0 itself compares stdout to expected_output (trailing-whitespace
 * tolerant) and returns Accepted / Wrong Answer per case.
 */
export async function runCases(opts: {
  languageId: string;
  sourceCode: string;
  cases: RunCaseInput[];
  timeLimitMs: number;
  memoryLimitKb: number;
}): Promise<CaseOutcome[]> {
  const lang = languageById(opts.languageId);
  if (!lang) throw new Error(`Unsupported language: ${opts.languageId}`);
  if (opts.cases.length === 0) return [];

  const submissions = opts.cases.map((c) => ({
    source_code: b64(opts.sourceCode),
    language_id: lang.judge0Id,
    stdin: b64(c.input),
    expected_output: b64(c.expectedOutput),
    cpu_time_limit: Math.min(15, Math.max(0.1, opts.timeLimitMs / 1000)),
    memory_limit: Math.min(512000, Math.max(16000, opts.memoryLimitKb)),
  }));

  const createRes = await judge0Fetch("/submissions/batch?base64_encoded=true", {
    method: "POST",
    body: JSON.stringify({ submissions }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    logger.error({ status: createRes.status, body }, "judge0 batch create failed");
    throw new Judge0UnavailableError(`Judge0 rejected the submission batch (${createRes.status})`);
  }
  const created = (await createRes.json()) as Array<{ token?: string }>;
  const tokens = created.map((c) => c.token).filter((t): t is string => Boolean(t));
  if (tokens.length !== opts.cases.length) {
    throw new Judge0UnavailableError("Judge0 did not return a token for every test case");
  }

  // Poll until every case leaves the queue (In Queue=1 / Processing=2).
  const fields = "token,status,stdout,stderr,compile_output,time,memory";
  const deadline = Date.now() + 60_000;
  let results: RawResult[] = [];
  for (;;) {
    const res = await judge0Fetch(
      `/submissions/batch?tokens=${tokens.join(",")}&base64_encoded=true&fields=${fields}`
    );
    if (!res.ok) throw new Judge0UnavailableError(`Judge0 poll failed (${res.status})`);
    const body = (await res.json()) as { submissions: RawResult[] };
    results = body.submissions;
    const pending = results.some((r) => !r.status || r.status.id <= 2);
    if (!pending) break;
    if (Date.now() > deadline) {
      throw new Judge0UnavailableError("Timed out waiting for Judge0 verdicts");
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // Judge0 returns batch results in token order == case order.
  return results.map((r) => {
    const statusId = r.status?.id ?? 13;
    const verdict = mapVerdict(statusId);
    return {
      token: r.token ?? null,
      verdict,
      passed: verdict === "accepted",
      stdout: truncate(unb64(r.stdout)),
      stderr: truncate(unb64(r.stderr)),
      compileOutput: truncate(unb64(r.compile_output)),
      timeMs: r.time != null ? Math.round(parseFloat(r.time) * 1000) : null,
      memoryKb: r.memory ?? null,
    };
  });
}

/** Never store unbounded program output (spec 8: capture stderr, but bounded). */
function truncate(s: string | null, max = 16_384): string | null {
  if (s == null) return null;
  return s.length > max ? `${s.slice(0, max)}\n... [truncated]` : s;
}
