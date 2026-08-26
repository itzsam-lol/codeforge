"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ListOrdered, X } from "lucide-react";
import { CodeEditor, ARENA_LANGUAGES } from "@/components/arena/CodeEditor";
import { EnvCheck } from "@/components/arena/EnvCheck";
import { Markdown } from "@/components/arena/Markdown";
import { McqPanel } from "@/components/arena/McqPanel";
import { OutputPanel, type RunResult, type SubmissionResult } from "@/components/arena/OutputPanel";
import { ProctoringLobby, type ChosenLevel } from "@/components/arena/ProctoringLobby";
import { Skeleton } from "@/components/arena/Skeleton";
import { ContestStandingsTable } from "../leaderboard/page";
import {
  useArenaProctoring,
  useArenaWebcam,
  useArenaSnapshotCapture,
  type ArenaProctoringLevel,
} from "@/lib/arenaProctoring";
import { ApiError, arenaApi } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";
import { useArenaToast } from "@/components/arena/ArenaToast";
import { toastForSubmission, useSubmissionPoll } from "@/lib/arenaSubmission";

interface ContestDetail {
  contestId: string;
  title: string;
  status: string;
  endAt: string;
  proctoringLevel: ArenaProctoringLevel;
  webcamRequired: boolean;
  fullscreenRequired: boolean;
  webcamBonusPct: number;
  lockdownBonusPct: number;
  questions: { contestQuestionId: string; seq: number; type: "coding" | "mcq"; title: string; difficulty: string; points: number }[];
  myParticipation: {
    status: string;
    chosenProctoringLevel: ChosenLevel;
    questionStatus: Record<string, "accepted" | "attempted">;
  } | null;
}

interface CodingQuestionDetail {
  type: "coding";
  contestQuestionId: string;
  title: string;
  bodyMd: string;
  points: number;
  languages: string[];
  starterCode: Record<string, string>;
  sampleCases: { input: string; expectedOutput: string }[];
}

interface McqQuestionDetail {
  type: "mcq";
  contestQuestionId: string;
  title: string;
  bodyMd: string;
  points: number;
  options: { id: string; text: string }[];
  multiple: boolean;
}

type QuestionDetail = CodingQuestionDetail | McqQuestionDetail;

function useCountdown(endAt: string) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(endAt).getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRemaining(Math.max(0, new Date(endAt).getTime() - Date.now())), 1000);
    return () => clearInterval(id);
  }, [endAt]);
  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { remaining, label: `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
}

export default function ArenaCompetePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useArenaAuth();
  const { data: contest, mutate: mutateContest } = useSWR<ContestDetail>(`/api/arena/contests/${slug}`, arenaApi);
  const [choosingLevel, setChoosingLevel] = useState(false);
  // Distinct from chosenProctoringLevel === "none": that value is
  // indistinguishable from "hasn't chosen yet" once someone actually picks
  // Casual, so whether the lobby has been shown this session is tracked
  // locally instead — set true immediately once a choice is made, or
  // inferred true up front if they're returning with a non-"none" choice or
  // have already started submitting (status moved off "registered").
  const [lobbyDone, setLobbyDone] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const { data: submissionPoll } = useSubmissionPoll(submissionId);
  const [showStandings, setShowStandings] = useState(false);
  const { showToast } = useArenaToast();
  const codeByQuestion = useRef<Record<string, string>>({});

  // Once grading finishes, refresh the contest so the question-tab status
  // dots (FEAT-7) and standings reflect the new verdict without a reload,
  // and surface the result as a toast.
  useEffect(() => {
    if (submissionPoll && submissionPoll.status !== "pending") {
      mutateContest();
      const { kind, message } = toastForSubmission(submissionPoll.status, submissionPoll.score);
      showToast(kind, message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionPoll?.status]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/arena/auth/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (contest && !activeQuestionId && contest.questions.length > 0) {
      setActiveQuestionId(contest.questions[0].contestQuestionId);
    }
  }, [contest, activeQuestionId]);

  useEffect(() => {
    if (!contest?.myParticipation) return;
    if (contest.myParticipation.chosenProctoringLevel !== "none" || contest.myParticipation.status !== "registered") {
      setLobbyDone(true);
    }
  }, [contest]);

  const { data: question } = useSWR<QuestionDetail>(
    checkedIn && activeQuestionId ? `/api/arena/contests/${slug}/questions/${activeQuestionId}` : null,
    arenaApi
  );

  useEffect(() => {
    setRunResults(null);
    setSubmissionId(null);
    setMessage(null);
  }, [activeQuestionId]);

  useEffect(() => {
    if (!question || question.type !== "coding") return;
    const saved = codeByQuestion.current[question.contestQuestionId];
    if (saved !== undefined) {
      setCode(saved);
    } else {
      const lang = question.languages[0] ?? "javascript";
      setLanguage(lang);
      setCode(question.starterCode[lang] ?? "");
    }
  }, [question]);

  const chosenLevel = contest?.myParticipation?.chosenProctoringLevel ?? "none";
  const lockdown = chosenLevel === "lockdown";
  const { events, isFullscreen } = useArenaProctoring({
    // Proctor-to-Earn level drives enforcement here (not the contest's base
    // proctoringLevel) — a participant who chose "none" gets no monitoring
    // even if the contest supports higher tiers for those who opt in.
    level: chosenLevel === "webcam" ? "strict" : chosenLevel === "lockdown" ? "lockdown" : "none",
    active: checkedIn,
  });
  const { videoRef, active: webcamActive } = useArenaWebcam({
    enabled: checkedIn && chosenLevel !== "none",
    onDenied: () => undefined,
  });
  useArenaSnapshotCapture({ slug, videoRef, enabled: checkedIn && webcamActive && chosenLevel !== "none" });
  const { label: timeLabel, remaining } = useCountdown(contest?.endAt ?? new Date().toISOString());

  const availableLanguages = useMemo(
    () =>
      ARENA_LANGUAGES.filter(
        (l) => !question || question.type !== "coding" || question.languages.length === 0 || question.languages.includes(l.id)
      ),
    [question]
  );

  if (!contest || authLoading) return <p className="px-6 py-24 text-center text-sm text-slate-500">Loading…</p>;
  if (contest.status !== "live") {
    return <p className="px-6 py-24 text-center text-sm text-slate-400">This contest isn&apos;t live right now.</p>;
  }
  if (!contest.myParticipation) {
    return <p className="px-6 py-24 text-center text-sm text-slate-400">Register for this contest first.</p>;
  }

  async function chooseLevel(level: ChosenLevel) {
    setChoosingLevel(true);
    try {
      await arenaApi(`/api/arena/contests/${slug}/proctoring-level`, { method: "POST", body: { level } });
      await mutateContest();
      setLobbyDone(true);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save your choice");
    } finally {
      setChoosingLevel(false);
    }
  }

  if (!lobbyDone) {
    return (
      <ProctoringLobby
        webcamBonusPct={contest.webcamBonusPct}
        lockdownBonusPct={contest.lockdownBonusPct}
        onChoose={chooseLevel}
        submitting={choosingLevel}
      />
    );
  }

  if (!checkedIn) {
    return (
      <section className="px-6 py-20">
        <EnvCheck
          level={contest.proctoringLevel}
          webcamRequired={chosenLevel !== "none"}
          fullscreenRequired={contest.fullscreenRequired}
          onReady={() => setCheckedIn(true)}
        />
      </section>
    );
  }

  function updateCode(v: string) {
    setCode(v);
    if (activeQuestionId) codeByQuestion.current[activeQuestionId] = v;
  }

  async function run() {
    if (!activeQuestionId) return;
    setRunning(true);
    setMessage(null);
    setSubmissionId(null);
    try {
      const res = await arenaApi<{ results: RunResult[] }>(
        `/api/arena/contests/${contest!.contestId}/questions/${activeQuestionId}/run`,
        { method: "POST", body: { code, language } }
      );
      setRunResults(res.results);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function submit() {
    if (!activeQuestionId) return;
    setSubmitting(true);
    setMessage(null);
    setRunResults(null);
    try {
      const res = await arenaApi<{ submissionId: string }>(
        `/api/arena/contests/${contest!.contestId}/questions/${activeQuestionId}/submit`,
        { method: "POST", body: { code, language } }
      );
      setSubmissionId(res.submissionId);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMcq(selectedOptionIds: string[]) {
    if (!activeQuestionId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await arenaApi<{ status: string; score: number }>(
        `/api/arena/contests/${contest!.contestId}/questions/${activeQuestionId}/submit`,
        { method: "POST", body: { selectedOptionIds } }
      );
      setMessage(res.status === "accepted" ? `Correct! +${res.score} points` : "Not quite — you can try again.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      {chosenLevel !== "none" ? <video ref={videoRef} muted playsInline className="hidden" /> : null}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#05070f] px-4 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {contest.questions.map((q) => {
            const status = contest.myParticipation?.questionStatus[q.contestQuestionId];
            return (
              <button
                key={q.contestQuestionId}
                onClick={() => setActiveQuestionId(q.contestQuestionId)}
                className={`relative shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  activeQuestionId === q.contestQuestionId
                    ? "bg-accent text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {q.seq}
                <span
                  className={`absolute right-0.5 top-0.5 size-1.5 rounded-full ${
                    status === "accepted" ? "bg-emerald-400" : status === "attempted" ? "bg-amber-400" : "bg-white/15"
                  }`}
                />
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowStandings(true)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
          >
            <ListOrdered className="size-3.5" /> Standings
          </button>
          {chosenLevel !== "none" ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> {chosenLevel} proctoring active
            </span>
          ) : null}
          {events.length > 0 ? (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle className="size-3.5" /> {events[events.length - 1].type.replace(/_/g, " ")}
            </span>
          ) : null}
          {contest.fullscreenRequired && !isFullscreen ? (
            <span className="text-xs text-amber-400">Not in fullscreen</span>
          ) : null}
          <span className={`rounded-md px-2.5 py-1 font-mono text-sm font-semibold ${remaining < 300_000 ? "bg-rose-500/20 text-rose-400" : "bg-white/10 text-white"}`}>
            {timeLabel}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-2/5 min-w-72 overflow-y-auto border-r border-white/10 bg-white/[0.02] p-6" onCopyCapture={(e) => lockdown && e.preventDefault()}>
          {question ? (
            <>
              <h2 className="text-lg font-semibold text-white">{question.title}</h2>
              <p className="mt-1 text-xs text-slate-500">{question.points} points</p>
              <div className="prose prose-invert prose-sm mt-4 max-w-none text-slate-300">
                <Markdown>{question.bodyMd}</Markdown>
              </div>
              {question.type === "coding" && question.sampleCases.length > 0 ? (
                <div className="mt-6 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sample cases</h3>
                  {question.sampleCases.map((c, i) => (
                    <div key={i} className="rounded-lg bg-black/30 p-3 font-mono text-xs text-slate-300">
                      <div>
                        <span className="text-slate-500">Input:</span> {c.input}
                      </div>
                      <div>
                        <span className="text-slate-500">Expected:</span> {c.expectedOutput}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div>
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="mt-2 h-3 w-20" />
              <Skeleton className="mt-4 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
              <Skeleton className="mt-6 h-24 w-full rounded-lg" />
            </div>
          )}
        </div>

        {question?.type === "mcq" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <McqPanel options={question.options} multiple={question.multiple} onSubmit={submitMcq} submitting={submitting} />
            {message ? <div className="border-t border-white/10 px-4 py-2 text-sm text-slate-300">{message}</div> : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  if (question?.type === "coding") updateCode(question.starterCode[e.target.value] ?? "");
                }}
                className="rounded-md bg-white/5 px-2 py-1 text-sm text-white"
              >
                {availableLanguages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={run}
                  disabled={running}
                  className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50"
                >
                  {running ? "Running…" : "Run"}
                </button>
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <CodeEditor language={language} value={code} onChange={updateCode} blockPaste={lockdown} />
            </div>
            {message ? <div className="border-t border-white/10 px-4 py-2 text-sm text-slate-300">{message}</div> : null}
            {runResults ? <OutputPanel kind="run" results={runResults} /> : null}
            {submissionId && submissionPoll ? (
              <OutputPanel kind="submission" status={submissionPoll.status} score={submissionPoll.score} results={submissionPoll.results} />
            ) : null}
          </div>
        )}
      </div>

      {showStandings ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setShowStandings(false)}>
          <div
            className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-white/10 bg-[#05070f]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h2 className="text-sm font-semibold text-white">Live standings</h2>
              <button onClick={() => setShowStandings(false)} className="text-slate-400 hover:text-white">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <ContestStandingsTable slug={slug} refreshInterval={30_000} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
