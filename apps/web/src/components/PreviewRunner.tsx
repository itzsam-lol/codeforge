"use client";

import { useState } from "react";
import { SUPPORTED_LANGUAGES } from "@codeforge/shared";
import { staffApi, ApiError } from "@/lib/api";
import type { QuestionData } from "./QuestionForm";
import { CodeEditor } from "./CodeEditor";
import { Badge, Button, Card, ErrorNote, Select } from "./ui";

interface PreviewResult {
  verdict: string;
  passed: boolean;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  timeMs: number | null;
  isHidden: boolean;
}

/**
 * Recruiter test-drive (spec 3.2): run a solution against ALL cases,
 * including hidden ones, exactly as the grader will.
 */
export function PreviewRunner({
  questionId,
  question,
}: {
  questionId: string;
  question: QuestionData;
}) {
  const cfg = question.typeConfig as { languages?: string[]; starterCode?: Record<string, string> };
  const langs = cfg.languages?.length ? cfg.languages : SUPPORTED_LANGUAGES.map((l) => l.id);
  const [language, setLanguage] = useState(langs[0]);
  const [code, setCode] = useState(cfg.starterCode?.[langs[0]] ?? "");
  const [results, setResults] = useState<PreviewResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const res = await staffApi<{ results: PreviewResult[] }>(
        `/api/questions/${questionId}/preview-run`,
        { method: "POST", body: { code, language } }
      );
      setResults(res.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Test-drive (runs all cases, hidden included)</h3>
        <div className="flex items-center gap-2">
          <Select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setCode(cfg.starterCode?.[e.target.value] ?? "");
            }}
            className="w-44"
          >
            {langs.map((l) => (
              <option key={l} value={l}>
                {SUPPORTED_LANGUAGES.find((x) => x.id === l)?.label ?? l}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={run} disabled={busy || !code.trim()}>
            {busy ? "Running…" : "Run all cases"}
          </Button>
        </div>
      </div>
      <div className="h-64 overflow-hidden rounded-lg border border-slate-800">
        <CodeEditor language={language} value={code} onChange={setCode} />
      </div>
      {error ? <ErrorNote message={error} /> : null}
      {results ? (
        <div className="space-y-1.5">
          {results.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs"
            >
              <span className="flex items-center gap-2">
                <Badge color={r.passed ? "green" : "red"}>{r.passed ? "PASS" : r.verdict}</Badge>
                Case {i + 1} {r.isHidden ? <span className="text-slate-500">(hidden)</span> : null}
              </span>
              <span className="text-slate-500">{r.timeMs != null ? `${r.timeMs} ms` : ""}</span>
            </div>
          ))}
          {results.some((r) => r.compileOutput || r.stderr) ? (
            <pre className="max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-rose-300">
              {results.find((r) => r.compileOutput)?.compileOutput ??
                results.find((r) => r.stderr)?.stderr}
            </pre>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
