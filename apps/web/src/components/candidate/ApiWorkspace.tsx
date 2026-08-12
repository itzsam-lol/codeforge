"use client";

/**
 * API/backend challenge workspace (spec 5.2): single-file Node HTTP server
 * editor with the required endpoints listed. Submit runs the hidden HTTP
 * harness in an isolated container (candidate code never runs in-browser).
 */
import { useState } from "react";
import type { CandidateQuestion } from "@codeforge/shared";
import { candidateApi, ApiError } from "@/lib/api";
import { CodeEditor } from "@/components/CodeEditor";
import { Markdown } from "@/components/Markdown";
import { Badge, Button } from "@/components/ui";
import type { Answer } from "./TestRunner";

export function ApiWorkspace({
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
  const code = answer?.content ?? question.apiStarterCode ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (
      !window.confirm(
        "Submit your server? It will be started in an isolated sandbox and graded against the hidden HTTP test suite. You can resubmit, the last submission counts."
      )
    )
      return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await candidateApi<{ version: number }>(
        token,
        `/api/candidate/questions/${question.questionId}/submit`,
        { method: "POST", body: { content: code } }
      );
      onSubmitted();
      setMsg(`Submission v${res.version} received. Grading runs in the background.`);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-2/5 min-w-72 overflow-y-auto border-r border-outline-variant bg-surface-container-lowest p-5">
        <Markdown>{question.bodyMd}</Markdown>
        <div className="mt-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Your server must listen on port {question.apiPort}
          </h4>
          <p className="text-xs text-on-surface-variant">
            Read it from <code className="rounded bg-surface-container-high px-1">process.env.PORT</code>. Use only
            Node built-ins (no npm install in the sandbox).
          </p>
        </div>
        {question.sampleHttpTests?.length ? (
          <div className="mt-4">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Sample checks
            </h4>
            <div className="space-y-1">
              {question.sampleHttpTests.map((t, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-surface-container px-2 py-1 text-xs">
                  <Badge color="indigo">{t.method}</Badge>
                  <code>{t.path}</code>
                  {t.expectStatus ? <span className="ml-auto text-on-surface-variant">→ {t.expectStatus}</span> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-3 py-1.5">
          <span className="font-mono text-xs text-on-surface-variant">server.js</span>
          <div className="flex items-center gap-2">
            {submissionCount > 0 ? (
              <span className="text-xs text-on-surface-variant">
                {submissionCount} submission{submissionCount === 1 ? "" : "s"}
              </span>
            ) : null}
            <Button size="sm" onClick={submit} disabled={submitting || !code.trim()}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <CodeEditor language="javascript" value={code} onChange={(v) => onChange({ content: v })} />
        </div>
        {msg ? (
          <div className="border-t border-slate-300 bg-slate-900 px-3 py-2 text-xs text-indigo-300">{msg}</div>
        ) : null}
      </div>
    </div>
  );
}
