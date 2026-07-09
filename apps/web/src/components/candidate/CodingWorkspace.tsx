"use client";

import { useMemo, useRef, useState } from "react";
import type { OnMount } from "@monaco-editor/react";
import { SUPPORTED_LANGUAGES, type CandidateQuestion, type CandidateRunCaseResult } from "@codeforge/shared";
import { candidateApi, ApiError } from "@/lib/api";
import { CodeEditor } from "@/components/CodeEditor";
import { Markdown } from "@/components/Markdown";
import { IconPlay } from "@/components/icons";
import { Badge, Button, Select, cn } from "@/components/ui";
import type { Answer, EditorOp } from "./TestRunner";

/**
 * Split-pane coding workspace: problem statement + sample cases on the left,
 * Monaco editor with Run/Submit and a console panel on the right.
 */
export function CodingWorkspace({
  token,
  question,
  answer,
  onChange,
  submissionCount,
  lockdown,
  onEditorOps,
  onProctorEvent,
  onSubmitted,
}: {
  token: string;
  question: CandidateQuestion;
  answer: Answer | undefined;
  onChange: (a: Answer) => void;
  submissionCount: number;
  lockdown: boolean;
  onEditorOps: (questionId: string, ops: EditorOp[]) => void;
  onProctorEvent: (type: string, metadata?: Record<string, unknown>) => void;
  onSubmitted: () => void;
}) {
  const languages = useMemo(() => {
    const allowed = question.languages?.length
      ? question.languages
      : SUPPORTED_LANGUAGES.map((l) => l.id);
    return SUPPORTED_LANGUAGES.filter((l) => allowed.includes(l.id));
  }, [question.languages]);

  const [language, setLanguage] = useState(
    answer?.language && languages.some((l) => l.id === answer.language)
      ? answer.language
      : languages[0]?.id ?? "javascript"
  );
  const code = answer?.content ?? question.starterCode?.[language] ?? "";
  // Per-language scratch so switching languages doesn't destroy work.
  const byLang = useRef<Record<string, string>>({ [language]: code });

  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<CandidateRunCaseResult[] | null>(null);
  const [panelMsg, setPanelMsg] = useState<string | null>(null);
  const [openCase, setOpenCase] = useState<number | null>(null);

  // --- Session-replay recording (Phase 2) ---
  const recordingStart = useRef(Date.now());
  // Edits applied by us (language switch / initial load) are tagged `init` so
  // the server's paste heuristic and the replay view can tell them apart.
  const programmatic = useRef(false);

  const handleEditorMount: OnMount = (editor, monaco) => {
    onEditorOps(question.questionId, [
      { t: 0, o: 0, d: 0, i: editor.getValue(), init: true },
    ]);
    editor.onDidChangeModelContent((e) => {
      const t = Date.now() - recordingStart.current;
      onEditorOps(
        question.questionId,
        e.changes.map((ch) => ({
          t,
          o: ch.rangeOffset,
          d: ch.rangeLength,
          i: ch.text,
          ...(programmatic.current ? { init: true } : {}),
        }))
      );
    });
    if (lockdown) {
      const blockPaste = () => onProctorEvent("paste_blocked");
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, blockPaste);
      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Insert, blockPaste);
    }
  };

  function switchLanguage(next: string) {
    byLang.current[language] = code;
    const restored = byLang.current[next] ?? question.starterCode?.[next] ?? "";
    programmatic.current = true;
    setTimeout(() => (programmatic.current = false), 400);
    setLanguage(next);
    onChange({ content: restored, language: next });
  }

  function edit(value: string) {
    byLang.current[language] = value;
    onChange({ content: value, language });
  }

  async function run() {
    setRunning(true);
    setResults(null);
    setPanelMsg(null);
    setOpenCase(null);
    try {
      const res = await candidateApi<{ results: CandidateRunCaseResult[] }>(
        token,
        `/api/candidate/questions/${question.questionId}/run`,
        { method: "POST", body: { code, language } }
      );
      setResults(res.results);
    } catch (err) {
      setPanelMsg(err instanceof ApiError ? err.message : "Run failed — try again.");
    } finally {
      setRunning(false);
    }
  }

  async function submit() {
    if (
      !window.confirm(
        "Submit this solution? It will be graded against all test cases, including hidden ones. You can resubmit — the last submission counts."
      )
    ) {
      return;
    }
    setSubmitting(true);
    setPanelMsg(null);
    try {
      const res = await candidateApi<{ version: number }>(
        token,
        `/api/candidate/questions/${question.questionId}/submit`,
        { method: "POST", body: { code, language } }
      );
      onSubmitted();
      setPanelMsg(
        `Submission v${res.version} received — it's being graded in the background. You can keep working or move on.`
      );
    } catch (err) {
      setPanelMsg(err instanceof ApiError ? err.message : "Submit failed — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Problem statement */}
      <div
        className="w-2/5 min-w-72 overflow-y-auto border-r border-slate-200 bg-white p-5"
        onCopyCapture={(e) => {
          if (lockdown) {
            e.preventDefault();
            onProctorEvent("copy_blocked");
          }
        }}
      >
        <Markdown>{question.bodyMd}</Markdown>
        {question.sampleCases?.length ? (
          <div className="mt-4 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Sample cases
            </h4>
            {question.sampleCases.map((c, i) => (
              <div key={i} className="rounded-lg border border-slate-200 text-xs">
                <div className="grid grid-cols-2 divide-x divide-slate-200">
                  <div className="p-2">
                    <div className="mb-1 font-medium text-slate-400">Input</div>
                    <pre className="overflow-x-auto whitespace-pre-wrap">{c.input || "(empty)"}</pre>
                  </div>
                  <div className="p-2">
                    <div className="mb-1 font-medium text-slate-400">Expected output</div>
                    <pre className="overflow-x-auto whitespace-pre-wrap">{c.expectedOutput}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-4 text-xs text-slate-400">
          Limits: {question.timeLimitMs ?? 2000} ms ·{" "}
          {Math.round((question.memoryLimitKb ?? 128000) / 1024)} MB
        </p>
      </div>

      {/* Editor + console */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-1.5">
          <Select value={language} onChange={(e) => switchLanguage(e.target.value)} className="w-48 !py-1 text-xs">
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            {submissionCount > 0 ? (
              <span className="text-xs text-slate-400">
                {submissionCount} submission{submissionCount === 1 ? "" : "s"}
              </span>
            ) : null}
            <Button size="sm" variant="secondary" onClick={run} disabled={running || submitting || !code.trim()}>
              {running ? "Running…" : (<><IconPlay size={12} /> Run samples</>)}
            </Button>
            <Button size="sm" onClick={submit} disabled={running || submitting || !code.trim()}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-[3]">
          <CodeEditor
            language={language}
            value={code}
            onChange={edit}
            onMount={handleEditorMount}
            contextMenu={!lockdown}
          />
        </div>

        {/* Console / results panel */}
        <div className="min-h-0 flex-[2] overflow-y-auto border-t border-slate-300 bg-slate-900 p-3 text-xs text-slate-200">
          {panelMsg ? <p className="mb-2 text-indigo-300">{panelMsg}</p> : null}
          {running ? <p className="text-slate-400">Executing sample cases in the sandbox…</p> : null}
          {results ? (
            <div className="space-y-1.5">
              <p className="text-slate-400">
                {results.filter((r) => r.passed).length}/{results.length} sample cases passed
              </p>
              {results.map((r, i) => (
                <div key={i} className="rounded-lg border border-slate-700">
                  <button
                    onClick={() => setOpenCase(openCase === i ? null : i)}
                    className="flex w-full items-center justify-between px-2.5 py-1.5"
                  >
                    <span className="flex items-center gap-2">
                      <Badge color={r.passed ? "green" : "red"}>
                        {r.passed ? "PASS" : r.verdict.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                      <span>Case {i + 1}</span>
                    </span>
                    <span className="text-slate-500">{r.timeMs != null ? `${r.timeMs} ms` : ""}</span>
                  </button>
                  {openCase === i ? (
                    <div className="space-y-1.5 border-t border-slate-700 p-2.5">
                      <ConsoleBlock label="Input" value={r.input} />
                      <ConsoleBlock label="Expected" value={r.expectedOutput} />
                      <ConsoleBlock label="Your output" value={r.stdout ?? ""} />
                      {r.stderr ? <ConsoleBlock label="stderr" value={r.stderr} error /> : null}
                      {r.compileOutput ? (
                        <ConsoleBlock label="Compiler" value={r.compileOutput} error />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : !running && !panelMsg ? (
            <p className="text-slate-500">
              Output appears here. “Run samples” executes the visible cases; “Submit” also grades
              the hidden ones.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ConsoleBlock({ label, value, error }: { label: string; value: string; error?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 font-medium text-slate-500">{label}</div>
      <pre
        className={cn(
          "max-h-28 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2",
          error ? "text-rose-300" : "text-slate-100"
        )}
      >
        {value || "(empty)"}
      </pre>
    </div>
  );
}
