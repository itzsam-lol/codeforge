"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { CodeEditor, ARENA_LANGUAGES } from "@/components/arena/CodeEditor";
import { Markdown } from "@/components/arena/Markdown";
import { OutputPanel, type RunResult } from "@/components/arena/OutputPanel";
import { ApiError, arenaApi } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";
import { useSubmissionPoll } from "@/lib/arenaSubmission";

interface Problem {
  id: string;
  slug: string;
  title: string;
  bodyMd: string;
  difficulty: string;
  languages: string[];
  starterCode: Record<string, string>;
  sampleCases: { input: string; expectedOutput: string }[];
}

export default function ArenaPracticeDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useArenaAuth();
  const { data: problem } = useSWR<Problem>(`/api/arena/practice/${slug}`, arenaApi);
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const { data: submissionPoll } = useSubmissionPoll(submissionId);
  const [hint, setHint] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/arena/auth/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!problem) return;
    const lang = problem.languages[0] ?? "javascript";
    setLanguage(lang);
    setCode(problem.starterCode[lang] ?? "");
  }, [problem]);

  if (!problem || authLoading || !user) return <p className="px-6 py-24 text-center text-sm text-slate-500">Loading…</p>;

  const availableLanguages = ARENA_LANGUAGES.filter(
    (l) => problem.languages.length === 0 || problem.languages.includes(l.id)
  );

  async function run() {
    setRunning(true);
    setMessage(null);
    setSubmissionId(null);
    try {
      const res = await arenaApi<{ results: RunResult[] }>(`/api/arena/practice/${problem!.id}/run`, {
        method: "POST",
        body: { code, language },
      });
      setRunResults(res.results);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setMessage(null);
    setRunResults(null);
    try {
      const res = await arenaApi<{ submissionId: string }>(`/api/arena/practice/${problem!.id}/submit`, {
        method: "POST",
        body: { code, language },
      });
      setSubmissionId(res.submissionId);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function askForHint() {
    setHintLoading(true);
    setHintError(null);
    try {
      const res = await arenaApi<{ hint: string; remaining: number }>(`/api/arena/practice/${problem!.id}/hint`, {
        method: "POST",
        body: { code, language },
      });
      setHint(res.hint);
    } catch (err) {
      setHintError(err instanceof ApiError ? err.message : "Hints are unavailable right now");
    } finally {
      setHintLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="w-2/5 min-w-72 overflow-y-auto border-r border-white/10 bg-white/[0.02] p-6">
          <h1 className="text-lg font-semibold text-white">{problem.title}</h1>
          <p className="mt-1 text-xs capitalize text-slate-500">{problem.difficulty}</p>
          <div className="prose prose-invert prose-sm mt-4 max-w-none text-slate-300">
            <Markdown>{problem.bodyMd}</Markdown>
          </div>
          {problem.sampleCases.length > 0 ? (
            <div className="mt-6 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sample cases</h3>
              {problem.sampleCases.map((c, i) => (
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

          {hint ? (
            <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-soft">AI hint</p>
              <p className="mt-1 text-sm text-slate-200">{hint}</p>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setCode(problem.starterCode[e.target.value] ?? "");
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
                onClick={askForHint}
                disabled={hintLoading}
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50"
              >
                {hintLoading ? "Thinking…" : "Ask AI for a hint"}
              </button>
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
            <CodeEditor language={language} value={code} onChange={setCode} />
          </div>
          {hintError ? <div className="border-t border-white/10 px-4 py-2 text-sm text-rose-400">{hintError}</div> : null}
          {message ? <div className="border-t border-white/10 px-4 py-2 text-sm text-slate-300">{message}</div> : null}
          {runResults ? <OutputPanel kind="run" results={runResults} /> : null}
          {submissionId && submissionPoll ? (
            <OutputPanel kind="submission" status={submissionPoll.status} score={submissionPoll.score} results={submissionPoll.results} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
