import type { SubmissionCaseResult } from "@/lib/arenaSubmission";

/** One sample-case result from POST .../run — always has visible I/O. */
export interface RunResult {
  input: string;
  expectedOutput: string;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  verdict: string;
  passed: boolean;
  timeMs: number | null;
  memoryKb: number | null;
}

export type SubmissionResult = SubmissionCaseResult;

const VERDICT_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  wrong_answer: "Wrong Answer",
  time_limit_exceeded: "Time Limit Exceeded",
  memory_limit_exceeded: "Memory Limit Exceeded",
  compile_error: "Compile Error",
  runtime_error: "Runtime Error",
  internal_error: "Internal Error",
};

const VERDICT_COLOR: Record<string, string> = {
  accepted: "bg-emerald-500/15 text-emerald-400",
  wrong_answer: "bg-rose-500/15 text-rose-400",
  time_limit_exceeded: "bg-amber-500/15 text-amber-400",
  memory_limit_exceeded: "bg-amber-500/15 text-amber-400",
  compile_error: "bg-rose-500/15 text-rose-400",
  runtime_error: "bg-rose-500/15 text-rose-400",
  internal_error: "bg-rose-500/15 text-rose-400",
  pending: "bg-white/10 text-slate-400",
};

function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${VERDICT_COLOR[verdict] ?? "bg-white/10 text-slate-400"}`}>
      {VERDICT_LABEL[verdict] ?? verdict}
    </span>
  );
}

function Cell({ children }: { children?: string | null }) {
  return (
    <pre className="max-h-24 max-w-xs overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-400">
      {children || "—"}
    </pre>
  );
}

/**
 * Shows what "Run" or "Submit" actually did — per-case verdict, output, and
 * timing — instead of a single summary line. `kind="run"` renders sample-
 * case results synchronously; `kind="submission"` renders a
 * useSubmissionPoll() result, showing a pending spinner row until grading
 * finishes.
 */
export function OutputPanel(
  props:
    | { kind: "run"; results: RunResult[] }
    | { kind: "submission"; status: string; score: number | null; results: SubmissionResult[] | null }
) {
  if (props.kind === "submission" && props.status === "pending") {
    return (
      <div className="flex items-center gap-2 border-t border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
        <span className="size-1.5 animate-pulse rounded-full bg-accent-2" /> Grading — this can take a few seconds…
      </div>
    );
  }

  const rows: { label: string; result: RunResult | SubmissionResult }[] =
    props.kind === "run"
      ? props.results.map((r, i) => ({ label: `Case ${i + 1}`, result: r }))
      : (props.results ?? []).map((r, i) => ({ label: r.isHidden ? `Hidden case ${i + 1}` : `Case ${i + 1}`, result: r }));

  const passedCount = rows.filter((r) => r.result.passed).length;

  return (
    <div className="border-t border-white/10 bg-black/20">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {props.kind === "submission" ? `Submitted${props.score != null ? ` — ${props.score} points` : ""}` : "Run results"}
        </span>
        <span className="text-xs text-slate-500">
          {passedCount}/{rows.length} passed
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-y border-white/10 text-slate-500">
              <th className="px-4 py-1.5 font-medium">Case</th>
              <th className="px-4 py-1.5 font-medium">Verdict</th>
              {"expectedOutput" in rows[0]?.result ? <th className="px-4 py-1.5 font-medium">Expected</th> : null}
              <th className="px-4 py-1.5 font-medium">Output</th>
              <th className="px-4 py-1.5 font-medium">Time</th>
              <th className="px-4 py-1.5 font-medium">Memory</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, result }, i) => (
              <tr key={i} className="border-b border-white/5 align-top">
                <td className="px-4 py-2 text-slate-400">{label}</td>
                <td className="px-4 py-2">
                  <VerdictBadge verdict={result.verdict} />
                </td>
                {"expectedOutput" in result ? (
                  <td className="px-4 py-2">
                    <Cell>{result.expectedOutput}</Cell>
                  </td>
                ) : null}
                <td className="px-4 py-2">
                  <Cell>{result.stdout ?? (result.stderr || undefined) ?? ("compileOutput" in result ? result.compileOutput : undefined)}</Cell>
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-slate-400">{result.timeMs != null ? `${result.timeMs}ms` : "—"}</td>
                <td className="px-4 py-2 whitespace-nowrap text-slate-400">
                  {result.memoryKb != null ? `${(result.memoryKb / 1024).toFixed(1)}MB` : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-slate-500">
                  No results.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
