"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { staffApi, ApiError } from "@/lib/api";
import { CodeEditor } from "@/components/CodeEditor";
import { Markdown } from "@/components/Markdown";
import { IntegrityPanel } from "@/components/recruiter/IntegrityPanel";
import { ReplayView } from "@/components/recruiter/ReplayView";
import { IconPlay, QuestionTypeIcon } from "@/components/icons";
import { DEFAULT_MANUAL_RUBRIC, QUESTION_TYPE_LABELS, type QuestionType } from "@codeforge/shared";
import { Badge, Button, Card, ErrorNote, Input, Spinner, StatusBadge, cn } from "@/components/ui";
import { fmtDateTime, fmtScore, titleCase, typeBadgeColor } from "@/lib/format";

interface JudgeResultRow {
  verdict: string;
  passed: boolean;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  timeMs: number | null;
  memoryKb: number | null;
  testCase: { input: string; expectedOutput: string; isHidden: boolean; weight: number } | null;
  metadata: Record<string, unknown> | null;
}

interface BreakdownRow {
  questionId: string;
  order: number;
  points: number;
  title: string;
  type: string;
  bodyMd?: string;
  mcq: { options: { id: string; textMd: string }[]; correctOptionIds: string[] } | null;
  finalSubmission: {
    id: string;
    content: string;
    language: string | null;
    status: string;
    autoScore: number | null;
    manualScore: number | null;
    maxPoints: number;
    effectiveScore: number;
    version: number;
    errorMessage: string | null;
    judgeResults: JudgeResultRow[];
  } | null;
  totalVersions: number;
  draft: { content: string; language: string | null } | null;
}

interface SessionPayload {
  session: {
    id: string;
    candidateName: string;
    candidateEmail: string;
    status: string;
    startedAt: string | null;
    submittedAt: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  };
  test: { id: string; title: string; durationMinutes: number };
  totals: { totalScore: number; maxScore: number };
  breakdown: BreakdownRow[];
}

export default function SessionReviewPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<SessionPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    staffApi<SessionPayload>(`/api/sessions/${params.id}`)
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load this session"));
  }, [params.id]);

  useEffect(load, [load]);

  if (!data) return loadError ? <ErrorNote message={loadError} /> : <Spinner />;
  const { session, test, totals, breakdown } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {loadError ? <ErrorNote message={loadError} /> : null}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-headline-sm text-on-surface">{session.candidateName}</h1>
          <p className="text-sm text-on-surface-variant">
            {session.candidateEmail} · {test.title}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Started {fmtDateTime(session.startedAt)} · Submitted {fmtDateTime(session.submittedAt)}
            {session.ipAddress ? ` · IP ${session.ipAddress}` : ""}
          </p>
        </div>
        <div className="text-right">
          <div className="text-display-lg text-on-surface">
            {fmtScore(totals.totalScore, totals.maxScore)}
          </div>
          <StatusBadge status={session.status} />
        </div>
      </Card>

      <IntegrityPanel sessionId={session.id} />

      {breakdown.some((r) => r.type === "repo_project" || r.type === "frontend_ui") ? (
        <RubricForm sessionId={session.id} />
      ) : null}

      {breakdown.map((row, i) => (
        <QuestionReview
          key={row.questionId}
          row={row}
          index={i}
          sessionId={session.id}
          onScored={load}
        />
      ))}
    </div>
  );
}

interface ReviewNoteRow {
  id: string;
  reviewerName: string;
  rubricScores: Record<string, number>;
  note: string;
  updatedAt: string;
}

/**
 * Manual rubric scoring (spec 3.7): sliders alongside the automated
 * sub-scores, for the question types automation can't fully judge
 * (repo-submission, UI-visual). One note per reviewer per session.
 */
function RubricForm({ sessionId }: { sessionId: string }) {
  const [notes, setNotes] = useState<ReviewNoteRow[] | null>(null);
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(DEFAULT_MANUAL_RUBRIC.map((c) => [c.key, 3]))
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    staffApi<{ rubric: typeof DEFAULT_MANUAL_RUBRIC; notes: ReviewNoteRow[] }>(
      `/api/sessions/${sessionId}/review-notes`
    )
      .then((d) => {
        setNotes(d.notes);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load reviewer notes"));
  }, [sessionId]);

  useEffect(load, [load]);

  async function save() {
    setBusy(true);
    setSaved(false);
    setSaveError(null);
    try {
      await staffApi(`/api/sessions/${sessionId}/review-notes`, {
        method: "PUT",
        body: { rubricScores: scores, note },
      });
      setSaved(true);
      load();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save your review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <h3 className="text-sm font-semibold">Reviewer rubric</h3>
      <p className="text-xs text-on-surface-variant">
        For repo-submission and UI-visual questions, automation can&apos;t judge everything.
        Score what you see, 1 (weak) to 5 (strong).
      </p>
      {loadError ? <ErrorNote message={loadError} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {DEFAULT_MANUAL_RUBRIC.map((c) => (
          <div key={c.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-on-surface-variant">{c.label}</span>
              <span className="text-on-surface-variant">{scores[c.key]}/5</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={scores[c.key]}
              onChange={(e) => setScores((prev) => ({ ...prev, [c.key]: Number(e.target.value) }))}
              className="w-full"
            />
          </div>
        ))}
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notes for the hiring panel (optional)"
      />
      {saveError ? <ErrorNote message={saveError} /> : null}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save my review"}
        </Button>
        {saved ? <span className="text-xs text-ok">Saved</span> : null}
      </div>
      {notes && notes.length > 0 ? (
        <div className="space-y-2 pt-3">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg bg-surface-container p-2.5 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-on-surface">{n.reviewerName}</span>
                <span className="text-on-surface-variant">{fmtDateTime(n.updatedAt)}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-on-surface-variant">
                {DEFAULT_MANUAL_RUBRIC.map((c) =>
                  n.rubricScores[c.key] != null ? (
                    <span key={c.key}>
                      {c.label}: <b>{n.rubricScores[c.key]}/5</b>
                    </span>
                  ) : null
                )}
              </div>
              {n.note ? <p className="mt-1 text-on-surface-variant">{n.note}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function QuestionReview({
  row,
  index,
  sessionId,
  onScored,
}: {
  row: BreakdownRow;
  index: number;
  sessionId: string;
  onScored: () => void;
}) {
  const [showStatement, setShowStatement] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const sub = row.finalSubmission;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between bg-surface-container-low px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-on-surface-variant">Q{index + 1}</span>
          <span className="text-sm font-semibold">{row.title}</span>
          <Badge color={typeBadgeColor(row.type)}>
            <QuestionTypeIcon type={row.type} />
            {QUESTION_TYPE_LABELS[row.type as QuestionType] ?? row.type}
          </Badge>
          {sub ? (
            <StatusBadge status={sub.status} />
          ) : (
            <Badge color="slate">Not attempted</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {row.type === "dsa" ? (
            <button
              onClick={() => setShowReplay((s) => !s)}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              {showReplay ? "Hide replay" : (<><IconPlay size={10} /> Replay typing</>)}
            </button>
          ) : null}
          <button
            onClick={() => setShowStatement((s) => !s)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {showStatement ? "Hide statement" : "Statement"}
          </button>
          <span className="text-sm font-semibold">
            {sub ? fmtScore(sub.effectiveScore, row.points) : `0 / ${row.points}`}
          </span>
        </div>
      </div>

      {showReplay ? (
        <div className="p-4">
          <ReplayView
            sessionId={sessionId}
            questionId={row.questionId}
            onClose={() => setShowReplay(false)}
          />
        </div>
      ) : null}

      {showStatement && row.bodyMd ? (
        <div className="bg-surface-container px-5 py-3">
          <Markdown>{row.bodyMd}</Markdown>
        </div>
      ) : null}

      <div className="space-y-4 p-5">
        {row.type === "mcq" && row.mcq ? (
          <McqReview row={row} />
        ) : row.type === "dsa" ? (
          <DsaReview row={row} />
        ) : (
          <AppDevReview row={row} />
        )}
        {sub ? <ScoreOverride sub={sub} points={row.points} onScored={onScored} /> : null}
      </div>
    </Card>
  );
}

/** Renders the Phase-3 grader outputs by their metadata.kind. */
function AppDevReview({ row }: { row: BreakdownRow }) {
  const sub = row.finalSubmission;
  if (!sub) {
    return row.draft ? (
      <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
        Unsubmitted draft (autosaved), not graded.
      </p>
    ) : (
      <p className="text-xs text-on-surface-variant">Not attempted.</p>
    );
  }
  const results = sub.judgeResults;
  const visual = results.filter((r) => r.metadata?.kind === "visual");
  const assertions = results.filter((r) => r.metadata?.kind === "assertion" || r.metadata?.kind === "interaction");
  const http = results.filter((r) => r.metadata?.kind === "http");
  const steps = results.filter((r) => r.metadata?.kind === "step");
  const tests = results.filter((r) => r.metadata?.kind === "test");
  const screenshots = results.filter((r) => r.metadata?.kind === "screenshot");
  const git = results.find((r) => r.metadata?.kind === "git")?.metadata as
    | { commitCount: number; messages: string[]; genericMessageCount: number; firstCommitAt?: string; lastCommitAt?: string }
    | undefined;
  const serverLogs = results.find((r) => r.metadata?.kind === "server_logs")?.metadata as { detail?: string } | undefined;

  return (
    <div className="space-y-4">
      {sub.errorMessage ? (
        <p className="rounded-lg bg-bad-bg px-3 py-2 text-xs text-bad">Grading error: {sub.errorMessage}</p>
      ) : null}

      {row.type === "repo_project" ? (
        <p className="text-xs text-on-surface-variant">
          Repository:{" "}
          <a href={sub.content} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            {sub.content}
          </a>
        </p>
      ) : null}

      {/* Visual diff gallery */}
      {visual.length > 0 ? (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Visual diff</h4>
          <div className="grid gap-3 md:grid-cols-2">
            {visual.map((v, i) => {
              const m = v.metadata as { width: number; similarityPct: number; referenceUrl?: string; candidateUrl?: string; diffUrl?: string };
              return (
                <div key={i} className="rounded-lg bg-surface-container p-2">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{m.width}px</span>
                    <Badge color={m.similarityPct >= 90 ? "green" : m.similarityPct >= 70 ? "amber" : "red"}>
                      {m.similarityPct}% match
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { label: "Reference", url: m.referenceUrl },
                      { label: "Candidate", url: m.candidateUrl },
                      { label: "Diff", url: m.diffUrl },
                    ].map((img) => (
                      <div key={img.label}>
                        <div className="mb-0.5 text-center text-[10px] text-on-surface-variant">{img.label}</div>
                        {img.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img.url} alt={img.label} className="w-full rounded shadow-[var(--shadow-card)]" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Assertion / interaction / HTTP / test / step checklists */}
      {assertions.length > 0 ? <ChecklistBlock title="DOM & interaction checks" rows={assertions} /> : null}
      {http.length > 0 ? <ChecklistBlock title="HTTP assertions" rows={http} /> : null}
      {tests.length > 0 ? <ChecklistBlock title="Test suite" rows={tests} /> : null}
      {steps.length > 0 ? <ChecklistBlock title="Pipeline steps" rows={steps} showOutput /> : null}

      {screenshots.length > 0 ? (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">App screenshots</h4>
          <div className="flex gap-2 overflow-x-auto">
            {screenshots.map((s, i) => {
              const m = s.metadata as { route: string; url?: string };
              return m.url ? (
                <a key={i} href={m.url} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.route} className="h-32 rounded-lg shadow-[var(--shadow-card)]" />
                  <div className="mt-0.5 text-center text-[10px] text-on-surface-variant">{m.route}</div>
                </a>
              ) : null;
            })}
          </div>
        </div>
      ) : null}

      {git ? (
        <div className="rounded-lg bg-surface-container p-3 text-xs">
          <h4 className="mb-1 font-semibold text-on-surface-variant">Git history (signal, not a rule)</h4>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-on-surface-variant">
            <span>{git.commitCount} commits</span>
            <span>{git.genericMessageCount} generic messages</span>
            {git.firstCommitAt ? <span>first {fmtDateTime(git.firstCommitAt)}</span> : null}
            {git.lastCommitAt ? <span>last {fmtDateTime(git.lastCommitAt)}</span> : null}
          </div>
          {git.messages.length > 0 ? (
            <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 text-on-surface-variant">
              {git.messages.slice(0, 8).map((m, i) => (
                <li key={i} className="truncate">{m}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {serverLogs?.detail ? (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Server logs</h4>
          <pre className="max-h-40 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
            {serverLogs.detail || "(no output)"}
          </pre>
        </div>
      ) : null}

      {/* Raw submission (code-ish types) */}
      {["api_challenge", "bug_fix"].includes(row.type) ? (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-accent">View submitted code</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {sub.content}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function ChecklistBlock({
  title,
  rows,
  showOutput,
}: {
  title: string;
  rows: JudgeResultRow[];
  showOutput?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        {title} ({rows.filter((r) => r.passed).length}/{rows.length})
      </h4>
      <div className="space-y-1">
        {rows.map((r, i) => {
          const m = (r.metadata ?? {}) as { name?: string; label?: string; step?: string; detail?: string };
          const name = m.name ?? m.label ?? m.step ?? `Check ${i + 1}`;
          return (
            <div key={i} className="rounded-lg bg-surface-container">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs"
              >
                <span className="flex items-center gap-2">
                  <Badge color={r.passed ? "green" : "red"}>{r.passed ? "PASS" : "FAIL"}</Badge>
                  {name}
                </span>
                {m.detail || (showOutput && r.stdout) ? <span className="text-on-surface-variant">details</span> : null}
              </button>
              {open === i ? (
                <div className="bg-surface-container-low p-2">
                  {m.detail ? <p className="text-xs text-on-surface-variant">{m.detail}</p> : null}
                  {showOutput && r.stdout ? (
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                      {r.stdout}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function McqReview({ row }: { row: BreakdownRow }) {
  const selected = new Set<string>(
    row.finalSubmission
      ? ((JSON.parse(row.finalSubmission.content) as { selectedOptionIds?: string[] })
          .selectedOptionIds ?? [])
      : []
  );
  const correct = new Set(row.mcq!.correctOptionIds);
  return (
    <div className="space-y-1.5">
      {row.mcq!.options.map((opt) => {
        const isSel = selected.has(opt.id);
        const isCorrect = correct.has(opt.id);
        return (
          <div
            key={opt.id}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              isCorrect ? "bg-ok-bg" : "bg-surface-container",
              isSel && !isCorrect ? "bg-bad-bg" : ""
            )}
          >
            <span className="w-5 text-xs font-semibold text-on-surface-variant">{opt.id.toUpperCase()}</span>
            <span className="flex-1">
              <Markdown>{opt.textMd}</Markdown>
            </span>
            {isSel ? <Badge color={isCorrect ? "green" : "red"}>selected</Badge> : null}
            {isCorrect ? <Badge color="green">correct</Badge> : null}
          </div>
        );
      })}
      {selected.size === 0 ? <p className="text-xs text-on-surface-variant">Not answered.</p> : null}
    </div>
  );
}

function DsaReview({ row }: { row: BreakdownRow }) {
  const sub = row.finalSubmission;
  const content = sub?.content ?? row.draft?.content;
  const language = sub?.language ?? row.draft?.language ?? "javascript";
  const [openCase, setOpenCase] = useState<number | null>(null);

  if (!content) return <p className="text-xs text-on-surface-variant">No code written.</p>;

  return (
    <div className="space-y-3">
      {!sub && row.draft ? (
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
          Unsubmitted draft (autosaved), not graded.
        </p>
      ) : null}
      <div className="h-64 overflow-hidden rounded-lg shadow-lg">
        <CodeEditor language={language} value={content} readOnly />
      </div>
      {sub?.errorMessage ? (
        <p className="rounded-lg bg-bad-bg px-3 py-2 text-xs text-bad">
          Grading error: {sub.errorMessage}
        </p>
      ) : null}
      {sub && sub.judgeResults.length > 0 ? (
        <div className="space-y-1">
          {sub.judgeResults.map((jr, i) => (
            <div key={i} className="rounded-lg bg-surface-container">
              <button
                onClick={() => setOpenCase(openCase === i ? null : i)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs"
              >
                <span className="flex items-center gap-2">
                  <Badge color={jr.passed ? "green" : "red"}>
                    {jr.passed ? "PASS" : titleCase(jr.verdict)}
                  </Badge>
                  Case {i + 1}
                  {jr.testCase?.isHidden ? <span className="text-on-surface-variant">(hidden)</span> : null}
                  {jr.testCase && jr.testCase.weight !== 1 ? (
                    <span className="text-on-surface-variant">w={jr.testCase.weight}</span>
                  ) : null}
                </span>
                <span className="text-on-surface-variant">
                  {jr.timeMs != null ? `${jr.timeMs} ms` : ""}
                  {jr.memoryKb != null ? ` · ${Math.round(jr.memoryKb / 1024)} MB` : ""}
                </span>
              </button>
              {openCase === i && jr.testCase ? (
                <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-3 text-xs">
                  <IoBlock label="Input" value={jr.testCase.input} />
                  <IoBlock label="Expected" value={jr.testCase.expectedOutput} />
                  <IoBlock label="stdout" value={jr.stdout ?? ""} />
                  <IoBlock label="stderr / compile" value={jr.stderr ?? jr.compileOutput ?? ""} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 font-medium text-on-surface-variant">{label}</div>
      <pre className="max-h-32 overflow-auto rounded bg-slate-900 p-2 text-slate-100">
        {value || "(empty)"}
      </pre>
    </div>
  );
}

function ScoreOverride({
  sub,
  points,
  onScored,
}: {
  sub: NonNullable<BreakdownRow["finalSubmission"]>;
  points: number;
  onScored: () => void;
}) {
  const [value, setValue] = useState(sub.manualScore != null ? String(sub.manualScore) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(clear = false) {
    setBusy(true);
    setError(null);
    try {
      await staffApi(`/api/submissions/${sub.id}/score`, {
        method: "PATCH",
        body: { manualScore: clear ? null : Number(value) },
      });
      onScored();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the score override");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 pt-3">
      {error ? <ErrorNote message={error} /> : null}
      <div className="flex items-center gap-2 text-xs text-on-surface-variant">
        <span>
          Auto score: <b>{fmtScore(sub.autoScore)}</b>
          {sub.manualScore != null ? (
            <>
              {" "}· overridden to <b>{fmtScore(sub.manualScore)}</b>
            </>
          ) : null}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={points}
            step={0.5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Override"
            className="w-24"
          />
          <Button size="sm" variant="secondary" disabled={busy || value === ""} onClick={() => apply()}>
            Set score
          </Button>
          {sub.manualScore != null ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => apply(true)}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
