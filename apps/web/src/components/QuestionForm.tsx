"use client";

import { useState } from "react";
import { SUPPORTED_LANGUAGES } from "@codeforge/shared";
import { staffApi, ApiError } from "@/lib/api";
import { Markdown } from "./Markdown";
import { Button, Card, ErrorNote, Field, Input, Select, Textarea, cn } from "./ui";

export interface QuestionData {
  id?: string;
  type: "dsa" | "mcq";
  title: string;
  bodyMd: string;
  difficulty: string;
  tags: string[];
  estimatedMinutes?: number | null;
  typeConfig: Record<string, unknown>;
  testCases?: {
    input: string;
    expectedOutput: string;
    isHidden: boolean;
    weight: number;
  }[];
}

interface TestCaseRow {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  weight: number;
}

interface McqOptionRow {
  id: string;
  textMd: string;
}

const OPTION_IDS = "abcdefghij".split("");

export function QuestionForm({
  initial,
  onSaved,
}: {
  initial?: QuestionData;
  onSaved: (id: string, versioned: boolean) => void;
}) {
  const editing = Boolean(initial?.id);
  const [type, setType] = useState<"dsa" | "mcq">(initial?.type ?? "dsa");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "medium");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    initial?.estimatedMinutes ? String(initial.estimatedMinutes) : ""
  );
  const [bodyMd, setBodyMd] = useState(initial?.bodyMd ?? "");
  const [showPreview, setShowPreview] = useState(false);

  // --- DSA state ---
  const dsaCfg = (initial?.typeConfig ?? {}) as {
    languages?: string[];
    starterCode?: Record<string, string>;
    timeLimitMs?: number;
    memoryLimitKb?: number;
  };
  const [languages, setLanguages] = useState<string[]>(dsaCfg.languages ?? ["javascript", "python"]);
  const [starterCode, setStarterCode] = useState<Record<string, string>>(dsaCfg.starterCode ?? {});
  const [starterLang, setStarterLang] = useState<string>(
    (dsaCfg.languages ?? ["javascript"])[0] ?? "javascript"
  );
  const [timeLimitMs, setTimeLimitMs] = useState(String(dsaCfg.timeLimitMs ?? 2000));
  const [memoryLimitKb, setMemoryLimitKb] = useState(String(dsaCfg.memoryLimitKb ?? 128000));
  const [testCases, setTestCases] = useState<TestCaseRow[]>(
    initial?.testCases?.map((tc) => ({ ...tc })) ?? [
      { input: "", expectedOutput: "", isHidden: false, weight: 1 },
    ]
  );

  // --- MCQ state ---
  const mcqCfg = (initial?.typeConfig ?? {}) as {
    options?: { id: string; textMd: string }[];
    correctOptionIds?: string[];
    multiple?: boolean;
    negativeMarkingPct?: number;
  };
  const [options, setOptions] = useState<McqOptionRow[]>(
    mcqCfg.options ?? [
      { id: "a", textMd: "" },
      { id: "b", textMd: "" },
    ]
  );
  const [correctIds, setCorrectIds] = useState<string[]>(mcqCfg.correctOptionIds ?? []);
  const [multiple, setMultiple] = useState(mcqCfg.multiple ?? false);
  const [negativePct, setNegativePct] = useState(
    String(Math.round((mcqCfg.negativeMarkingPct ?? 0) * 100))
  );

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleCorrect(id: string) {
    if (multiple) {
      setCorrectIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setCorrectIds([id]);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      type,
      title,
      bodyMd,
      difficulty,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      typeConfig:
        type === "dsa"
          ? {
              languages,
              starterCode: Object.fromEntries(
                Object.entries(starterCode).filter(([k, v]) => languages.includes(k) && v.trim())
              ),
              timeLimitMs: Number(timeLimitMs),
              memoryLimitKb: Number(memoryLimitKb),
            }
          : {
              options: options.filter((o) => o.textMd.trim()),
              correctOptionIds: correctIds,
              multiple,
              negativeMarkingPct: Number(negativePct) / 100,
            },
      testCases: type === "dsa" ? testCases : [],
    };
    try {
      const res = editing
        ? await staffApi<{ question: { id: string }; versioned: boolean }>(
            `/api/questions/${initial!.id}`,
            { method: "PUT", body: payload }
          )
        : await staffApi<{ question: { id: string } }>("/api/questions", {
            method: "POST",
            body: payload,
          });
      onSaved(res.question.id, "versioned" in res ? Boolean(res.versioned) : false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.message}${err.details ? ": " + err.details.map((d) => `${d.path} — ${d.message}`).join("; ") : ""}`
          : "Save failed"
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="Type">
            <Select
              value={type}
              disabled={editing}
              onChange={(e) => setType(e.target.value as "dsa" | "mcq")}
            >
              <option value="dsa">DSA / Coding</option>
              <option value="mcq">MCQ / MSQ</option>
            </Select>
          </Field>
          <Field label="Difficulty">
            <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
          </Field>
          <Field label="Tags" hint="Comma-separated">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="arrays, dp" />
          </Field>
          <Field label="Est. minutes">
            <Input
              type="number"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Question title" />
        </Field>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Problem statement (Markdown)</span>
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              {showPreview ? "Edit" : "Preview"}
            </button>
          </div>
          {showPreview ? (
            <div className="min-h-40 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <Markdown>{bodyMd || "*Nothing to preview*"}</Markdown>
            </div>
          ) : (
            <Textarea rows={10} value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} />
          )}
        </div>
      </Card>

      {type === "dsa" ? (
        <>
          <Card className="space-y-4 p-5">
            <h3 className="text-sm font-semibold">Execution settings</h3>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() =>
                    setLanguages((prev) =>
                      prev.includes(lang.id) ? prev.filter((l) => l !== lang.id) : [...prev, lang.id]
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    languages.includes(lang.id)
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  )}
                >
                  {lang.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:w-1/2">
              <Field label="Time limit (ms)">
                <Input type="number" value={timeLimitMs} onChange={(e) => setTimeLimitMs(e.target.value)} />
              </Field>
              <Field label="Memory limit (KB)">
                <Input type="number" value={memoryLimitKb} onChange={(e) => setMemoryLimitKb(e.target.value)} />
              </Field>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600">Starter code for</span>
                <Select
                  value={starterLang}
                  onChange={(e) => setStarterLang(e.target.value)}
                  className="w-44"
                >
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {SUPPORTED_LANGUAGES.find((x) => x.id === l)?.label ?? l}
                    </option>
                  ))}
                </Select>
              </div>
              <Textarea
                rows={8}
                value={starterCode[starterLang] ?? ""}
                onChange={(e) =>
                  setStarterCode((prev) => ({ ...prev, [starterLang]: e.target.value }))
                }
                placeholder="// Boilerplate shown to the candidate for this language"
              />
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Test cases</h3>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setTestCases((prev) => [
                    ...prev,
                    { input: "", expectedOutput: "", isHidden: true, weight: 1 },
                  ])
                }
              >
                Add case
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Visible cases are shown to candidates and used by “Run”. Hidden cases only run on
              “Submit” and drive the score.
            </p>
            {testCases.map((tc, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Case {i + 1}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={tc.isHidden}
                        onChange={(e) =>
                          setTestCases((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, isHidden: e.target.checked } : x))
                          )
                        }
                      />
                      Hidden
                    </label>
                    <label className="flex items-center gap-1">
                      Weight
                      <input
                        type="number"
                        min={0.1}
                        step={0.5}
                        value={tc.weight}
                        onChange={(e) =>
                          setTestCases((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, weight: Number(e.target.value) || 1 } : x
                            )
                          )
                        }
                        className="w-16 rounded border border-slate-300 px-1 py-0.5"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setTestCases((prev) => prev.filter((_, j) => j !== i))}
                      className="font-medium text-rose-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Textarea
                    rows={3}
                    placeholder="stdin"
                    value={tc.input}
                    onChange={(e) =>
                      setTestCases((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, input: e.target.value } : x))
                      )
                    }
                  />
                  <Textarea
                    rows={3}
                    placeholder="expected stdout"
                    value={tc.expectedOutput}
                    onChange={(e) =>
                      setTestCases((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, expectedOutput: e.target.value } : x))
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : (
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Options</h3>
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={multiple}
                  onChange={(e) => {
                    setMultiple(e.target.checked);
                    if (!e.target.checked) setCorrectIds((prev) => prev.slice(0, 1));
                  }}
                />
                Multiple answers (MSQ)
              </label>
              <label className="flex items-center gap-1.5">
                Negative marking
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={negativePct}
                  onChange={(e) => setNegativePct(e.target.value)}
                  className="w-14 rounded border border-slate-300 px-1 py-0.5"
                />
                %
              </label>
              <Button
                size="sm"
                variant="secondary"
                disabled={options.length >= 10}
                onClick={() =>
                  setOptions((prev) => [...prev, { id: OPTION_IDS[prev.length], textMd: "" }])
                }
              >
                Add option
              </Button>
            </div>
          </div>
          {options.map((opt, i) => (
            <div key={opt.id} className="flex items-center gap-2">
              <input
                type={multiple ? "checkbox" : "radio"}
                name="correct"
                checked={correctIds.includes(opt.id)}
                onChange={() => toggleCorrect(opt.id)}
                title="Mark as correct"
              />
              <span className="w-5 text-xs font-semibold text-slate-400">{opt.id.toUpperCase()}</span>
              <Input
                value={opt.textMd}
                placeholder={`Option ${opt.id.toUpperCase()} (Markdown supported)`}
                onChange={(e) =>
                  setOptions((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, textMd: e.target.value } : x))
                  )
                }
              />
              <button
                type="button"
                disabled={options.length <= 2}
                onClick={() => {
                  setOptions((prev) => prev.filter((_, j) => j !== i));
                  setCorrectIds((prev) => prev.filter((id) => id !== opt.id));
                }}
                className="text-xs font-medium text-rose-500 hover:underline disabled:text-slate-300"
              >
                Remove
              </button>
            </div>
          ))}
          <p className="text-xs text-slate-400">
            Tick the correct option(s). Candidates never see which options are correct.
          </p>
        </Card>
      )}

      {error ? <ErrorNote message={error} /> : null}
      <div className="flex justify-end gap-2">
        <Button onClick={save} disabled={busy || !title.trim() || !bodyMd.trim()}>
          {busy ? "Saving…" : editing ? "Save changes" : "Create question"}
        </Button>
      </div>
    </div>
  );
}
