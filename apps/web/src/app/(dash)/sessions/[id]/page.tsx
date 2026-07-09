"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { staffApi } from "@/lib/api";
import { CodeEditor } from "@/components/CodeEditor";
import { Markdown } from "@/components/Markdown";
import { IntegrityPanel } from "@/components/recruiter/IntegrityPanel";
import { ReplayView } from "@/components/recruiter/ReplayView";
import { IconPlay } from "@/components/icons";
import { Badge, Button, Card, Input, Spinner, statusBadgeColor, cn } from "@/components/ui";
import { fmtDateTime, fmtScore, titleCase } from "@/lib/format";

interface JudgeResultRow {
  verdict: string;
  passed: boolean;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  timeMs: number | null;
  memoryKb: number | null;
  testCase: { input: string; expectedOutput: string; isHidden: boolean; weight: number } | null;
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

  const load = useCallback(() => {
    staffApi<SessionPayload>(`/api/sessions/${params.id}`).then(setData);
  }, [params.id]);

  useEffect(load, [load]);

  if (!data) return <Spinner />;
  const { session, test, totals, breakdown } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-lg font-semibold">{session.candidateName}</h1>
          <p className="text-sm text-slate-500">
            {session.candidateEmail} · {test.title}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Started {fmtDateTime(session.startedAt)} · Submitted {fmtDateTime(session.submittedAt)}
            {session.ipAddress ? ` · IP ${session.ipAddress}` : ""}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-slate-900">
            {fmtScore(totals.totalScore, totals.maxScore)}
          </div>
          <Badge color={statusBadgeColor(session.status)}>{titleCase(session.status)}</Badge>
        </div>
      </Card>

      <IntegrityPanel sessionId={session.id} />

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
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Q{index + 1}</span>
          <span className="text-sm font-semibold">{row.title}</span>
          <Badge color={row.type === "dsa" ? "indigo" : "blue"}>{row.type.toUpperCase()}</Badge>
          {sub ? (
            <Badge color={statusBadgeColor(sub.status)}>{titleCase(sub.status)}</Badge>
          ) : (
            <Badge color="slate">Not attempted</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {row.type === "dsa" ? (
            <button
              onClick={() => setShowReplay((s) => !s)}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
            >
              {showReplay ? "Hide replay" : (<><IconPlay size={10} /> Replay typing</>)}
            </button>
          ) : null}
          <button
            onClick={() => setShowStatement((s) => !s)}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            {showStatement ? "Hide statement" : "Statement"}
          </button>
          <span className="text-sm font-semibold">
            {sub ? fmtScore(sub.effectiveScore, row.points) : `0 / ${row.points}`}
          </span>
        </div>
      </div>

      {showReplay ? (
        <div className="border-b border-slate-100 p-4">
          <ReplayView
            sessionId={sessionId}
            questionId={row.questionId}
            onClose={() => setShowReplay(false)}
          />
        </div>
      ) : null}

      {showStatement && row.bodyMd ? (
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <Markdown>{row.bodyMd}</Markdown>
        </div>
      ) : null}

      <div className="space-y-4 p-5">
        {row.type === "mcq" && row.mcq ? (
          <McqReview row={row} />
        ) : (
          <DsaReview row={row} />
        )}
        {sub ? <ScoreOverride sub={sub} points={row.points} onScored={onScored} /> : null}
      </div>
    </Card>
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
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              isCorrect ? "border-emerald-300 bg-emerald-50" : "border-slate-200",
              isSel && !isCorrect ? "border-rose-300 bg-rose-50" : ""
            )}
          >
            <span className="w-5 text-xs font-semibold text-slate-400">{opt.id.toUpperCase()}</span>
            <span className="flex-1">
              <Markdown>{opt.textMd}</Markdown>
            </span>
            {isSel ? <Badge color={isCorrect ? "green" : "red"}>selected</Badge> : null}
            {isCorrect ? <Badge color="green">correct</Badge> : null}
          </div>
        );
      })}
      {selected.size === 0 ? <p className="text-xs text-slate-400">Not answered.</p> : null}
    </div>
  );
}

function DsaReview({ row }: { row: BreakdownRow }) {
  const sub = row.finalSubmission;
  const content = sub?.content ?? row.draft?.content;
  const language = sub?.language ?? row.draft?.language ?? "javascript";
  const [openCase, setOpenCase] = useState<number | null>(null);

  if (!content) return <p className="text-xs text-slate-400">No code written.</p>;

  return (
    <div className="space-y-3">
      {!sub && row.draft ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Unsubmitted draft (autosaved) — not graded.
        </p>
      ) : null}
      <div className="h-64 overflow-hidden rounded-lg border border-slate-800">
        <CodeEditor language={language} value={content} readOnly />
      </div>
      {sub?.errorMessage ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Grading error: {sub.errorMessage}
        </p>
      ) : null}
      {sub && sub.judgeResults.length > 0 ? (
        <div className="space-y-1">
          {sub.judgeResults.map((jr, i) => (
            <div key={i} className="rounded-lg border border-slate-100">
              <button
                onClick={() => setOpenCase(openCase === i ? null : i)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs"
              >
                <span className="flex items-center gap-2">
                  <Badge color={jr.passed ? "green" : "red"}>
                    {jr.passed ? "PASS" : titleCase(jr.verdict)}
                  </Badge>
                  Case {i + 1}
                  {jr.testCase?.isHidden ? <span className="text-slate-400">(hidden)</span> : null}
                  {jr.testCase && jr.testCase.weight !== 1 ? (
                    <span className="text-slate-400">w={jr.testCase.weight}</span>
                  ) : null}
                </span>
                <span className="text-slate-400">
                  {jr.timeMs != null ? `${jr.timeMs} ms` : ""}
                  {jr.memoryKb != null ? ` · ${Math.round(jr.memoryKb / 1024)} MB` : ""}
                </span>
              </button>
              {openCase === i && jr.testCase ? (
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3 text-xs">
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
      <div className="mb-0.5 font-medium text-slate-400">{label}</div>
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

  async function apply(clear = false) {
    setBusy(true);
    try {
      await staffApi(`/api/submissions/${sub.id}/score`, {
        method: "PATCH",
        body: { manualScore: clear ? null : Number(value) },
      });
      onScored();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
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
  );
}
