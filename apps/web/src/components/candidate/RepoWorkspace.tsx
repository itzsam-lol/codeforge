"use client";

/**
 * Repo-submission workspace (spec 5.3): GitHub URL field with a "Validate"
 * dry-run (clone + inspect) before final submit. The pipeline clones, builds,
 * and tests server-side.
 */
import { useState } from "react";
import type { CandidateQuestion } from "@codeforge/shared";
import { candidateApi, ApiError } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { Button, Card, ErrorNote, Input, cn } from "@/components/ui";
import { IconCheckCircle, IconX } from "@/components/icons";
import type { Answer } from "./TestRunner";

interface ValidateResult {
  ok: boolean;
  detail: string;
  hasPackageJson: boolean;
  commitCount: number;
}

export function RepoWorkspace({
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
  const [url, setUrl] = useState(answer?.content ?? "");
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setValue(v: string) {
    setUrl(v);
    setValidation(null);
    onChange({ content: v });
  }

  async function validate() {
    setValidating(true);
    setError(null);
    setValidation(null);
    try {
      const res = await candidateApi<ValidateResult>(
        token,
        `/api/candidate/questions/${question.questionId}/validate-repo`,
        { method: "POST", body: { url } }
      );
      setValidation(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function submit() {
    if (!window.confirm("Submit this repository for grading? You can resubmit, the last submission counts."))
      return;
    setSubmitting(true);
    setError(null);
    setMsg(null);
    try {
      const res = await candidateApi<{ version: number }>(
        token,
        `/api/candidate/questions/${question.questionId}/submit`,
        { method: "POST", body: { content: url.trim() } }
      );
      onSubmitted();
      setMsg(`Submission v${res.version} received. Clone, build, and tests run in the background.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <Markdown>{question.bodyMd}</Markdown>

        <Card className="space-y-3 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-on-surface-variant">Public repository URL</span>
            <Input
              value={url}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://github.com/you/your-project"
            />
            <span className="mt-1 block text-xs text-on-surface-variant">
              GitHub, GitLab, or Bitbucket over https. Make sure the repository is public.
            </span>
          </label>

          {error ? <ErrorNote message={error} /> : null}

          {validation ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
                validation.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"
              )}
            >
              {validation.ok ? <IconCheckCircle size={16} /> : <IconX size={16} />}
              <div>
                <div className="font-medium">{validation.detail}</div>
                {validation.ok ? (
                  <div className="mt-0.5 text-ok">
                    {validation.commitCount} commits · package.json {validation.hasPackageJson ? "found" : "not found"}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {msg ? (
            <div className="rounded-md bg-accent/10 px-3 py-2 text-xs text-accent">{msg}</div>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface-variant">
              {submissionCount > 0 ? `${submissionCount} submission${submissionCount === 1 ? "" : "s"}` : ""}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={validate} disabled={validating || !url.trim()}>
                {validating ? "Validating…" : "Validate"}
              </Button>
              <Button size="sm" onClick={submit} disabled={submitting || !url.trim()}>
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
