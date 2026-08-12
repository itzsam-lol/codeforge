"use client";

/**
 * Bug-fix challenge workspace (spec type 4): a broken multi-file project with
 * file tabs. Candidate edits and submits; a hidden node:test suite grades the
 * fix. Submission content is JSON: { files: { path: contents } }.
 */
import { useMemo, useState } from "react";
import type { CandidateQuestion } from "@codeforge/shared";
import { languageById } from "@codeforge/shared";
import { candidateApi, ApiError } from "@/lib/api";
import { CodeEditor } from "@/components/CodeEditor";
import { Markdown } from "@/components/Markdown";
import { Button, cn } from "@/components/ui";
import type { Answer } from "./TestRunner";

function parseFiles(content: string | undefined, starter: Record<string, string>): Record<string, string> {
  if (content) {
    try {
      const p = JSON.parse(content) as { files?: Record<string, string> };
      if (p.files) return { ...starter, ...p.files };
    } catch {
      /* fall through */
    }
  }
  return { ...starter };
}

function langOf(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".html")) return "html";
  return "javascript";
}

export function BugFixWorkspace({
  token,
  question,
  answer,
  onChange,
  onSubmitted,
  submissionCount,
}: {
  token: string;
  question: CandidateQuestion;
  answer: Answer | undefined;
  onChange: (a: Answer) => void;
  onSubmitted: () => void;
  submissionCount: number;
}) {
  const starter = question.files ?? {};
  const [files, setFiles] = useState<Record<string, string>>(() => parseFiles(answer?.content, starter));
  const paths = useMemo(() => Object.keys(files), [files]);
  const [active, setActive] = useState(paths[0] ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function edit(value: string) {
    const next = { ...files, [active]: value };
    setFiles(next);
    onChange({ content: JSON.stringify({ files: next }) });
  }

  async function submit() {
    if (
      !window.confirm(
        "Submit your fix? The hidden test suite will run against your files. You can resubmit, the last submission counts."
      )
    )
      return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await candidateApi<{ version: number }>(
        token,
        `/api/candidate/questions/${question.questionId}/submit`,
        { method: "POST", body: { content: JSON.stringify({ files }) } }
      );
      onSubmitted();
      setMsg(`Submission v${res.version} received. The test suite is running in the background.`);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const monacoLang = languageById(langOf(active))?.monacoId ?? langOf(active);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-2/5 min-w-72 overflow-y-auto border-r border-outline-variant bg-surface-container-lowest p-5">
        <Markdown>{question.bodyMd}</Markdown>
        {question.sampleTestNames?.length ? (
          <p className="mt-4 rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
            The hidden suite includes tests such as:{" "}
            <span className="font-medium">{question.sampleTestNames.join(", ")}</span>. Make them all
            pass.
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-2 py-1">
          <div className="flex flex-wrap gap-0.5">
            {paths.map((p) => (
              <button
                key={p}
                onClick={() => setActive(p)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
                  active === p ? "bg-slate-800 text-white" : "text-on-surface-variant hover:bg-surface-container-low"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {submissionCount > 0 ? (
              <span className="text-xs text-on-surface-variant">{submissionCount} sub</span>
            ) : null}
            <Button size="sm" onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <CodeEditor language={monacoLang} value={files[active] ?? ""} onChange={edit} />
        </div>
        {msg ? (
          <div className="border-t border-slate-300 bg-slate-900 px-3 py-2 text-xs text-indigo-300">{msg}</div>
        ) : null}
      </div>
    </div>
  );
}
