"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import type { CandidateQuestion } from "@codeforge/shared";
import { candidateApi, ApiError } from "@/lib/api";
import { useProctoring, useWebcamCapture, type ProctoringConfig } from "@/lib/proctoring";
import { Button, Card, Spinner, cn } from "@/components/ui";
import { ConfirmDialog } from "@/components/Modal";
import { Markdown } from "@/components/Markdown";
import { IconAlert, IconFlag, IconHelp, IconMonitor } from "@/components/icons";
import { Wordmark } from "@/components/Wordmark";
import { usePublicBranding } from "@/lib/branding";
import { Timer } from "./Timer";
import { McqWorkspace } from "./McqWorkspace";
import { GetHelpModal } from "./GetHelpModal";

// Code-split by question type: a candidate only ever works on one workspace
// at a time, so there's no reason to ship the other five in the initial
// bundle (RepoWorkspace/FrontendWorkspace in particular pull in extra
// grading-preview logic that most sessions never touch).
const workspaceLoading = () => <Spinner label="Loading workspace…" />;
const CodingWorkspace = dynamic(() => import("./CodingWorkspace").then((m) => m.CodingWorkspace), {
  loading: workspaceLoading,
});
const FrontendWorkspace = dynamic(() => import("./FrontendWorkspace").then((m) => m.FrontendWorkspace), {
  loading: workspaceLoading,
});
const ApiWorkspace = dynamic(() => import("./ApiWorkspace").then((m) => m.ApiWorkspace), {
  loading: workspaceLoading,
});
const BugFixWorkspace = dynamic(() => import("./BugFixWorkspace").then((m) => m.BugFixWorkspace), {
  loading: workspaceLoading,
});
const RepoWorkspace = dynamic(() => import("./RepoWorkspace").then((m) => m.RepoWorkspace), {
  loading: workspaceLoading,
});

export interface EditorOp {
  t: number;
  o: number;
  d: number;
  i: string;
  init?: boolean;
}

const NAV_LABELS: Record<string, string> = {
  mcq: "MCQ",
  dsa: "Coding",
  frontend_ui: "UI Build",
  api_challenge: "API",
  bug_fix: "Bug Fix",
  repo_project: "Repo",
};

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

export interface FinishSummary {
  answered: number;
  total: number;
  flagged: number;
}

export function TestRunner({
  token,
  proctoring,
  supportEmail,
  onFinished,
}: {
  token: string;
  proctoring: ProctoringConfig;
  supportEmail: string | null;
  onFinished: (summary?: FinishSummary) => void;
}) {
  const branding = usePublicBranding();
  const [helpOpen, setHelpOpen] = useState(false);
  const [state, setState] = useState<CandidateState | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const [current, setCurrent] = useState(0);
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submissions, setSubmissions] = useState<Record<string, { count: number }>>({});
  const [finishing, setFinishing] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState<{ unanswered: number } | null>(null);
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
        setConfirmSubmit({ unanswered });
        return;
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
        /* server may have auto-submitted already, same outcome */
      }
      onFinished(
        state
          ? {
              answered: state.questions.filter((q) => isAnswered(q, answersRef.current, submissions)).length,
              total: state.questions.length,
              flagged: flags.size,
            }
          : undefined
      );
    },
    [state, submissions, flags, token, saveDraft, flushEditorOps, onFinished]
  );

  if (!state) return <Spinner label="Preparing your workspace…" />;

  const question = state.questions[current];
  const answer = answers[question.questionId];
  const endsAtMs = state.session.endsAt ? new Date(state.session.endsAt).getTime() : null;
  const answeredCount = state.questions.filter((q) => isAnswered(q, answers, submissions)).length;

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

  const bumpSubmission = (qid: string) =>
    setSubmissions((prev) => ({ ...prev, [qid]: { count: (prev[qid]?.count ?? 0) + 1 } }));

  function renderWorkspace() {
    const q = question;
    const a = answer;
    const set = (ans: Answer) => updateAnswer(q.questionId, ans);
    const count = submissions[q.questionId]?.count ?? 0;
    switch (q.type) {
      case "mcq":
        return (
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
              <Markdown>{q.bodyMd}</Markdown>
              <McqWorkspace question={q} answer={a} onChange={set} />
            </div>
          </div>
        );
      case "frontend_ui":
        return <FrontendWorkspace token={token} question={q} answer={a} onChange={set} />;
      case "api_challenge":
        return (
          <ApiWorkspace
            token={token}
            question={q}
            answer={a}
            onChange={set}
            submissionCount={count}
            onSubmitted={() => bumpSubmission(q.questionId)}
          />
        );
      case "bug_fix":
        return (
          <BugFixWorkspace
            token={token}
            question={q}
            answer={a}
            onChange={set}
            submissionCount={count}
            onSubmitted={() => bumpSubmission(q.questionId)}
          />
        );
      case "repo_project":
        return (
          <RepoWorkspace
            token={token}
            question={q}
            answer={a}
            onChange={set}
            submissionCount={count}
            onSubmitted={() => bumpSubmission(q.questionId)}
          />
        );
      default:
        return (
          <CodingWorkspace
            token={token}
            question={q}
            answer={a}
            onChange={set}
            submissionCount={count}
            lockdown={proctoring.level === "lockdown"}
            onEditorOps={recordEditorOps}
            onProctorEvent={report}
            onSubmitted={() => bumpSubmission(q.questionId)}
          />
        );
    }
  }

  const accentStyle: CSSProperties | undefined = branding.accentColor
    ? ({
        "--color-accent": branding.accentColor,
        "--color-accent-hover": branding.accentColorHover ?? branding.accentColor,
      } as CSSProperties)
    : undefined;

  return (
    <div data-theme="candidate" style={accentStyle} className="flex h-screen flex-col bg-surface">
      {/* Hidden webcam stream (strict/lockdown) */}
      {proctoring.webcamRequired ? (
        <video ref={videoRef} muted playsInline className="hidden" aria-hidden />
      ) : null}

      {/* Fullscreen lock-in overlay (spec 3.4.3) */}
      {fsOverlayBlocking ? (
        <div className="cf-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <Card className="cf-scale-in max-w-sm p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
              <IconMonitor size={22} />
            </div>
            <h2 className="mt-2 text-sm font-semibold text-on-surface">Fullscreen required</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
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

      <ConfirmDialog
        open={confirmSubmit !== null}
        title="Submit the test?"
        body={
          confirmSubmit && confirmSubmit.unanswered > 0
            ? `You still have ${confirmSubmit.unanswered} unanswered question(s). Submit anyway?`
            : "You won't be able to make further changes."
        }
        confirmLabel={finishing ? "Submitting…" : "Submit"}
        onCancel={() => setConfirmSubmit(null)}
        onConfirm={() => {
          setConfirmSubmit(null);
          void finish(false);
        }}
      />

      <GetHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} token={token} supportEmail={supportEmail} />

      {/* Header */}
      <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Wordmark branding={branding} size="sm" />
          <span className="hidden text-sm text-on-surface-variant sm:block">{state.test.title}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-1 text-xs font-medium text-on-surface-variant hover:text-accent"
            aria-label="Get help"
          >
            <IconHelp size={13} />
            <span className="hidden sm:inline">Get help</span>
          </button>
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "text-xs",
              saveState === "error" ? "text-bad" : "text-on-surface-variant"
            )}
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Autosaved"
                : saveState === "error"
                  ? "Autosave failed, retrying on next edit"
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
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between bg-warn-bg px-4 py-1.5 text-xs text-warn"
        >
          <span>You left fullscreen. This was logged.</span>
          <button
            className="font-medium underline"
            onClick={() => document.documentElement.requestFullscreen().catch(() => undefined)}
          >
            Re-enter fullscreen
          </button>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div role="status" aria-live="polite" className="cf-fade-in space-y-1 bg-bad-bg px-4 py-1.5">
          {warnings.map((w) => (
            <div key={w.type} className="flex items-center gap-1.5 text-xs font-medium text-bad">
              <IconAlert size={14} />
              {w.type === "tab_switch" ? "Tab switches" : "Fullscreen exits"}: {w.count} of {w.limit}{" "}
              allowed, exceeding the limit submits the test automatically.
            </div>
          ))}
        </div>
      ) : null}

      <a
        href="#candidate-workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-16 focus:z-50 focus:rounded-control focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to question workspace
      </a>

      <div className="flex min-h-0 flex-1">
        {/* Question navigator, stays on the dark theme */}
        <nav className="w-44 shrink-0 overflow-y-auto border-r border-outline-variant bg-surface-container-lowest p-3">
          <div className="mb-2 px-1 text-[11px] text-on-surface-variant">
            {answeredCount} of {state.questions.length} answered
          </div>
          <div className="space-y-1">
          {state.questions.map((q, i) => {
            const answered = isAnswered(q, answers, submissions);
            return (
              <button
                key={q.questionId}
                onClick={() => goTo(i)}
                aria-current={i === current ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium",
                  i === current
                    ? "bg-accent text-white"
                    : answered
                      ? "bg-ok-bg text-ok hover:bg-ok-bg/70"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    i === current ? "bg-white/20" : answered ? "bg-ok/30" : "bg-surface-container-high"
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate">{NAV_LABELS[q.type] ?? "Question"}</span>
                {flags.has(q.questionId) ? (
                  <IconFlag size={12} filled className="ml-auto shrink-0 text-warn" />
                ) : null}
              </button>
            );
          })}
          </div>
        </nav>

        {/* Workspace: re-scoped back to the light "recruiter" tokens for a
            breathable, legible question/answer surface, distinct from the
            surrounding dark chrome (the Monaco editor inside CodingWorkspace
            stays dark IDE-style regardless, via its own fixed theme prop). */}
        <main id="candidate-workspace" data-theme="recruiter" className="flex min-w-0 flex-1 flex-col bg-surface">
          <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-4 py-2">
            <div className="text-sm font-semibold text-on-surface">
              Q{current + 1}. {question.title}
              <span className="ml-2 text-xs font-normal text-on-surface-variant">
                {question.points} pts
                {question.hasNegativeMarking ? " · negative marking" : ""}
              </span>
            </div>
            <button
              onClick={() => toggleFlag(question.questionId)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                flags.has(question.questionId)
                  ? "bg-warn-bg text-warn hover:bg-warn-bg/70"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-warn"
              )}
            >
              <IconFlag size={13} filled={flags.has(question.questionId)} />
              {flags.has(question.questionId) ? "Unflag" : "Flag for review"}
            </button>
          </div>

          <div key={question.questionId} className="cf-fade-in flex min-h-0 flex-1 flex-col">
          {renderWorkspace()}
          </div>

          <div className="flex justify-between border-t border-outline-variant bg-surface-container-lowest px-4 py-2">
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
