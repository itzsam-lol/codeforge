"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CandidateQuestion } from "@codeforge/shared";
import { candidateApi, ApiError } from "@/lib/api";
import { useProctoring, useWebcamCapture, type ProctoringConfig } from "@/lib/proctoring";
import { Button, Card, Spinner, cn } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { IconAlert, IconFlag, IconMonitor } from "@/components/icons";
import { Timer } from "./Timer";
import { CodingWorkspace } from "./CodingWorkspace";
import { McqWorkspace } from "./McqWorkspace";

export interface EditorOp {
  t: number;
  o: number;
  d: number;
  i: string;
  init?: boolean;
}

interface CandidateState {
  serverNow: string;
  session: {
    id: string;
    status: string;
    endsAt: string | null;
    currentQuestionId: string | null;
  };
  test: { title: string };
  questions: CandidateQuestion[];
  drafts: Record<string, { content: string; language: string | null }>;
  submissions: Record<string, { count: number; lastSubmittedAt: string }>;
}

export interface Answer {
  content: string;
  language?: string;
}

export function TestRunner({
  token,
  proctoring,
  onFinished,
}: {
  token: string;
  proctoring: ProctoringConfig;
  onFinished: () => void;
}) {
  const [state, setState] = useState<CandidateState | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const [current, setCurrent] = useState(0);
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submissions, setSubmissions] = useState<Record<string, { count: number }>>({});
  const [finishing, setFinishing] = useState(false);
  // Server-clock offset, measured ONCE at state fetch (server time - client time).
  const [serverOffset, setServerOffset] = useState(0);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const finishedRef = useRef(false);

  // ------------------------------------------------------------- proctoring
  const handleForceSubmit = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished();
  }, [onFinished]);

  const proctorActive = state !== null && !finishing;
  const { report, isFullscreen, warnings } = useProctoring({
    token,
    config: proctoring,
    active: proctorActive,
    onForceSubmit: handleForceSubmit,
  });
  const { videoRef } = useWebcamCapture({
    token,
    enabled: proctoring.webcamRequired && proctorActive,
    onDenied: () => report("webcam_denied"),
  });

  // ------------------------------------------------- editor replay stream
  const opsBuffer = useRef<Record<string, EditorOp[]>>({});
  const recordEditorOps = useCallback((questionId: string, ops: EditorOp[]) => {
    (opsBuffer.current[questionId] ??= []).push(...ops);
  }, []);
  const flushEditorOps = useCallback(
    async (onlyQuestionId?: string) => {
      const ids = onlyQuestionId ? [onlyQuestionId] : Object.keys(opsBuffer.current);
      for (const id of ids) {
        const ops = opsBuffer.current[id];
        if (!ops || ops.length === 0) continue;
        opsBuffer.current[id] = [];
        await candidateApi(token, "/api/candidate/editor-events", {
          method: "POST",
          body: { questionId: id, ops: ops.slice(0, 500) },
        }).catch(() => {
          opsBuffer.current[id] = [...ops, ...(opsBuffer.current[id] ?? [])];
        });
      }
    },
    [token]
  );
  useEffect(() => {
    if (!state) return;
    const id = setInterval(() => void flushEditorOps(), 5000);
    return () => clearInterval(id);
  }, [state, flushEditorOps]);

  // ------------------------------------------------------------------ loading
  useEffect(() => {
    candidateApi<CandidateState>(token, "/api/candidate/state")
      .then((s) => {
        if (s.session.status !== "in_progress") {
          onFinished();
          return;
        }
        setState(s);
        setServerOffset(new Date(s.serverNow).getTime() - Date.now());
        setSubmissions(s.submissions);
        const initial: Record<string, Answer> = {};
        for (const q of s.questions) {
          const draft = s.drafts[q.questionId];
          if (draft) {
            initial[q.questionId] = {
              content: draft.content,
              language: draft.language ?? undefined,
            };
          }
        }
        setAnswers(initial);
        // Resume on the question the candidate was last looking at.
        const idx = s.questions.findIndex((q) => q.questionId === s.session.currentQuestionId);
        if (idx >= 0) setCurrent(idx);
        // Flags are UI-only state; restore what this browser remembered.
        try {
          const raw = sessionStorage.getItem(`cf_flags_${s.session.id}`);
          if (raw) setFlags(new Set(JSON.parse(raw) as string[]));
        } catch {
          /* ignore */
        }
      })
      .catch(() => onFinished());
  }, [token, onFinished]);

  // ------------------------------------------------------------------ autosave
  const saveDraft = useCallback(
    async (questionId: string) => {
      const answer = answersRef.current[questionId];
      if (!answer) return;
      setSaveState("saving");
      try {
        await candidateApi(token, `/api/candidate/questions/${questionId}/draft`, {
          method: "PUT",
          body: { content: answer.content, language: answer.language },
        });
        setSaveState("saved");
      } catch (err) {
        // 403 after the deadline means the server already auto-submitted.
        if (err instanceof ApiError && err.status === 403 && !finishedRef.current) {
          finishedRef.current = true;
          onFinished();
          return;
        }
        setSaveState("error");
      }
    },
    [token, onFinished]
  );

  const updateAnswer = useCallback(
    (questionId: string, answer: Answer) => {
      setAnswers((prev) => ({ ...prev, [questionId]: answer }));
      clearTimeout(saveTimers.current[questionId]);
      saveTimers.current[questionId] = setTimeout(() => void saveDraft(questionId), 2500);
    },
    [saveDraft]
  );

  // Flush pending save + replay ops when the candidate switches questions.
  const goTo = useCallback(
    (index: number) => {
      const q = state?.questions[current];
      if (q) {
        clearTimeout(saveTimers.current[q.questionId]);
        void saveDraft(q.questionId);
        void flushEditorOps(q.questionId);
      }
      setCurrent(index);
    },
    [state, current, saveDraft, flushEditorOps]
  );

  // ------------------------------------------------------------------ finish
  const finish = useCallback(
    async (confirmFirst: boolean) => {
      if (finishedRef.current) return;
      if (confirmFirst) {
        const unanswered = state
          ? state.questions.filter((q) => !isAnswered(q, answersRef.current, submissions)).length
          : 0;
        const msg =
          unanswered > 0
            ? `You still have ${unanswered} unanswered question(s). Submit the test anyway?`
            : "Submit the test? You won't be able to make further changes.";
        if (!window.confirm(msg)) return;
      }
      finishedRef.current = true;
      setFinishing(true);
      // Flush all pending drafts + replay ops before finalizing.
      Object.values(saveTimers.current).forEach(clearTimeout);
      const qids = state?.questions.map((q) => q.questionId) ?? [];
      await Promise.allSettled([
        ...qids.filter((id) => answersRef.current[id]).map((id) => saveDraft(id)),
        flushEditorOps(),
      ]);
      try {
        await candidateApi(token, "/api/candidate/finish", { method: "POST" });
      } catch {
        /* server may have auto-submitted already — same outcome */
      }
      onFinished();
    },
    [state, submissions, token, saveDraft, flushEditorOps, onFinished]
  );

  if (!state) return <Spinner label="Preparing your workspace…" />;

  const question = state.questions[current];
  const answer = answers[question.questionId];
  const endsAtMs = state.session.endsAt ? new Date(state.session.endsAt).getTime() : null;

  function toggleFlag(qid: string) {
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      try {
        sessionStorage.setItem(`cf_flags_${state!.session.id}`, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const fsOverlayBlocking =
    proctoring.fullscreenRequired &&
    !isFullscreen &&
    ["strict", "lockdown"].includes(proctoring.level);
  const fsBannerOnly = proctoring.fullscreenRequired && !isFullscreen && proctoring.level === "basic";

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      {/* Hidden webcam stream (strict/lockdown) */}
      {proctoring.webcamRequired ? (
        <video ref={videoRef} muted playsInline className="hidden" aria-hidden />
      ) : null}

      {/* Fullscreen lock-in overlay (spec 3.4.3) */}
      {fsOverlayBlocking ? (
        <div className="cf-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm">
          <Card className="cf-scale-in max-w-sm p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <IconMonitor size={22} />
            </div>
            <h2 className="mt-2 text-sm font-semibold">Fullscreen required</h2>
            <p className="mt-1 text-xs text-slate-500">
              This exit has been logged.
              {proctoring.limits.maxFullscreenExits
                ? ` After ${proctoring.limits.maxFullscreenExits} exits the test submits automatically.`
                : ""}
            </p>
            <Button
              className="mt-3"
              onClick={() => document.documentElement.requestFullscreen().catch(() => undefined)}
            >
              Re-enter fullscreen
            </Button>
          </Card>
        </div>
      ) : null}

      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-tight">
            Code<span className="text-indigo-600">Forge</span>
          </span>
          <span className="hidden text-sm text-slate-500 sm:block">{state.test.title}</span>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "text-xs",
              saveState === "error" ? "text-rose-600" : "text-slate-400"
            )}
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "All changes saved"
                : saveState === "error"
                  ? "Autosave failed — retrying on next edit"
                  : ""}
          </span>
          {endsAtMs ? (
            <Timer endsAtMs={endsAtMs} offsetMs={serverOffset} onExpire={() => void finish(false)} />
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => void finish(true)} disabled={finishing}>
            {finishing ? "Submitting…" : "Finish test"}
          </Button>
        </div>
      </header>

      {fsBannerOnly ? (
        <div className="flex items-center justify-between bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          <span>You left fullscreen — this was logged.</span>
          <button
            className="font-medium underline"
            onClick={() => document.documentElement.requestFullscreen().catch(() => undefined)}
          >
            Re-enter fullscreen
          </button>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="cf-fade-in flex items-center gap-1.5 bg-rose-50 px-4 py-1.5 text-xs font-medium text-rose-700">
          <IconAlert size={14} />
          {warnings[0].type === "tab_switch" ? "Tab switches" : "Fullscreen exits"}:{" "}
          {warnings[0].count} of {warnings[0].limit} allowed — exceeding the limit submits the
          test automatically.
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Question navigator */}
        <nav className="w-44 shrink-0 space-y-1 overflow-y-auto border-r border-slate-200 bg-white p-3">
          {state.questions.map((q, i) => {
            const answered = isAnswered(q, answers, submissions);
            return (
              <button
                key={q.questionId}
                onClick={() => goTo(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium",
                  i === current
                    ? "bg-indigo-600 text-white"
                    : answered
                      ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    i === current ? "bg-white/20" : answered ? "bg-emerald-200" : "bg-slate-200"
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate">{q.type === "mcq" ? "MCQ" : "Coding"}</span>
                {flags.has(q.questionId) ? (
                  <IconFlag size={12} filled className="ml-auto shrink-0 text-amber-500" />
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Workspace */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
            <div className="text-sm font-semibold">
              Q{current + 1}. {question.title}
              <span className="ml-2 text-xs font-normal text-slate-400">
                {question.points} pts
                {question.hasNegativeMarking ? " · negative marking" : ""}
              </span>
            </div>
            <button
              onClick={() => toggleFlag(question.questionId)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                flags.has(question.questionId)
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "text-slate-500 hover:bg-slate-100 hover:text-amber-600"
              )}
            >
              <IconFlag size={13} filled={flags.has(question.questionId)} />
              {flags.has(question.questionId) ? "Unflag" : "Flag for review"}
            </button>
          </div>

          <div key={question.questionId} className="cf-fade-in flex min-h-0 flex-1 flex-col">
          {question.type === "mcq" ? (
            <div
              className="flex-1 overflow-y-auto p-6"
              onCopyCapture={(e) => {
                if (proctoring.level === "lockdown") {
                  e.preventDefault();
                  report("copy_blocked");
                }
              }}
            >
              <div className="mx-auto max-w-2xl space-y-5">
                <Markdown>{question.bodyMd}</Markdown>
                <McqWorkspace
                  question={question}
                  answer={answer}
                  onChange={(a) => updateAnswer(question.questionId, a)}
                />
              </div>
            </div>
          ) : (
            <CodingWorkspace
              key={question.questionId}
              token={token}
              question={question}
              answer={answer}
              onChange={(a) => updateAnswer(question.questionId, a)}
              submissionCount={submissions[question.questionId]?.count ?? 0}
              lockdown={proctoring.level === "lockdown"}
              onEditorOps={recordEditorOps}
              onProctorEvent={report}
              onSubmitted={() =>
                setSubmissions((prev) => ({
                  ...prev,
                  [question.questionId]: {
                    count: (prev[question.questionId]?.count ?? 0) + 1,
                  },
                }))
              }
            />
          )}
          </div>

          <div className="flex justify-between border-t border-slate-200 bg-white px-4 py-2">
            <Button variant="secondary" size="sm" disabled={current === 0} onClick={() => goTo(current - 1)}>
              ← Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={current === state.questions.length - 1}
              onClick={() => goTo(current + 1)}
            >
              Next →
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}

function isAnswered(
  q: CandidateQuestion,
  answers: Record<string, Answer>,
  submissions: Record<string, { count: number }>
): boolean {
  if ((submissions[q.questionId]?.count ?? 0) > 0) return true;
  const a = answers[q.questionId];
  if (!a?.content) return false;
  if (q.type === "mcq") {
    try {
      const parsed = JSON.parse(a.content) as { selectedOptionIds?: string[] };
      return (parsed.selectedOptionIds?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }
  return a.content.trim().length > 0;
}
