"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Field, Input, Textarea } from "@/components/ui";

/** Same 6-language set apps/marketing/src/components/arena/CodeEditor.tsx
 *  offers candidates — duplicated rather than shared since HQ and marketing
 *  are separate workspaces with no shared UI package between them. */
export const CODING_LANGUAGES: { id: string; label: string }[] = [
  { id: "javascript", label: "JavaScript (Node.js)" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python 3" },
  { id: "cpp", label: "C++ (GCC)" },
  { id: "java", label: "Java" },
  { id: "go", label: "Go" },
];

export interface TestCase {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  weight: number;
}

export interface CodingConfig {
  languages: string[];
  starterCode: Record<string, string>;
  timeLimitMs: number;
  memoryLimitKb: number;
  testCases: TestCase[];
}

export interface McqOption {
  id: string;
  text: string;
}

export interface McqConfig {
  options: McqOption[];
  correctOptionIds: string[];
  multiple: boolean;
}

export const DEFAULT_CODING_CONFIG: CodingConfig = {
  languages: [],
  starterCode: {},
  timeLimitMs: 2000,
  memoryLimitKb: 128000,
  testCases: [{ input: "", expectedOutput: "", isHidden: false, weight: 1 }],
};

export const DEFAULT_MCQ_CONFIG: McqConfig = {
  options: [
    { id: "a", text: "" },
    { id: "b", text: "" },
  ],
  correctOptionIds: ["a"],
  multiple: false,
};

/** True structural validation (not just "is this JSON") — the same checks
 *  a staff member used to have to verify by eye in a raw textarea. */
export function validateCodingConfig(cfg: CodingConfig): string | null {
  if (cfg.testCases.length === 0) return "Add at least one test case";
  if (cfg.testCases.some((tc) => !tc.expectedOutput.trim())) return "Every test case needs an expected output";
  return null;
}

export function validateMcqConfig(cfg: McqConfig): string | null {
  if (cfg.options.length < 2) return "Add at least 2 options";
  if (cfg.options.some((o) => !o.text.trim())) return "Every option needs text";
  if (cfg.correctOptionIds.length === 0) return "Mark at least one option as correct";
  if (!cfg.multiple && cfg.correctOptionIds.length > 1) return "Single-select MCQs can only have one correct option";
  return null;
}

export function MarkdownPreview({ value }: { value: string }) {
  return (
    <div className="prose prose-sm max-w-none rounded-control border border-outline-variant bg-surface-container-low p-3">
      {value.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      ) : (
        <p className="text-on-surface-variant">Nothing to preview yet.</p>
      )}
    </div>
  );
}

/** Side-by-side edit/preview for a markdown field (FEAT problem-statement
 *  preview) — a plain Textarea on the left, live-rendered output on the
 *  right, stacking on narrow screens instead of side-by-side. */
export function MarkdownField({
  label,
  value,
  onChange,
  rows = 8,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
        <MarkdownPreview value={value} />
      </div>
    </Field>
  );
}

function nextOptionId(existing: string[]): string {
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(97 + i); // a, b, c, ...
    if (!existing.includes(id)) return id;
  }
  return `opt${existing.length}`;
}

export function McqOptionBuilder({ config, onChange }: { config: McqConfig; onChange: (cfg: McqConfig) => void }) {
  function updateOption(id: string, text: string) {
    onChange({ ...config, options: config.options.map((o) => (o.id === id ? { ...o, text } : o)) });
  }

  function toggleCorrect(id: string) {
    const isCorrect = config.correctOptionIds.includes(id);
    if (config.multiple) {
      onChange({
        ...config,
        correctOptionIds: isCorrect ? config.correctOptionIds.filter((x) => x !== id) : [...config.correctOptionIds, id],
      });
    } else {
      onChange({ ...config, correctOptionIds: [id] });
    }
  }

  function addOption() {
    const id = nextOptionId(config.options.map((o) => o.id));
    onChange({ ...config, options: [...config.options, { id, text: "" }] });
  }

  function removeOption(id: string) {
    onChange({
      ...config,
      options: config.options.filter((o) => o.id !== id),
      correctOptionIds: config.correctOptionIds.filter((x) => x !== id),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="radio"
            checked={!config.multiple}
            onChange={() =>
              onChange({ ...config, multiple: false, correctOptionIds: config.correctOptionIds.slice(0, 1) })
            }
          />
          Single select
        </label>
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input type="radio" checked={config.multiple} onChange={() => onChange({ ...config, multiple: true })} />
          Multi select
        </label>
      </div>

      <div className="space-y-2">
        {config.options.map((opt) => (
          <div key={opt.id} className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-on-surface-variant" title="Correct answer">
              <input
                type={config.multiple ? "checkbox" : "radio"}
                checked={config.correctOptionIds.includes(opt.id)}
                onChange={() => toggleCorrect(opt.id)}
              />
              {opt.id.toUpperCase()}
            </label>
            <Input
              value={opt.text}
              onChange={(e) => updateOption(opt.id, e.target.value)}
              placeholder="Option text"
              className="flex-1"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={config.options.length <= 2}
              onClick={() => removeOption(opt.id)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <Button size="sm" variant="secondary" disabled={config.options.length >= 10} onClick={addOption}>
        + Add option
      </Button>
    </div>
  );
}

export function TestCaseBuilder({ config, onChange }: { config: CodingConfig; onChange: (cfg: CodingConfig) => void }) {
  function updateCase(i: number, patch: Partial<TestCase>) {
    onChange({ ...config, testCases: config.testCases.map((tc, idx) => (idx === i ? { ...tc, ...patch } : tc)) });
  }

  function addCase() {
    onChange({ ...config, testCases: [...config.testCases, { input: "", expectedOutput: "", isHidden: true, weight: 1 }] });
  }

  function removeCase(i: number) {
    onChange({ ...config, testCases: config.testCases.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      {config.testCases.map((tc, i) => (
        <div key={i} className="space-y-2 rounded-control border border-outline-variant p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant">Test case {i + 1}</span>
            <Button size="sm" variant="ghost" disabled={config.testCases.length <= 1} onClick={() => removeCase(i)}>
              Remove
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Input">
              <Textarea rows={3} className="font-mono text-xs" value={tc.input} onChange={(e) => updateCase(i, { input: e.target.value })} />
            </Field>
            <Field label="Expected output">
              <Textarea
                rows={3}
                className="font-mono text-xs"
                value={tc.expectedOutput}
                onChange={(e) => updateCase(i, { expectedOutput: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-on-surface">
              <input type="checkbox" checked={tc.isHidden} onChange={(e) => updateCase(i, { isHidden: e.target.checked })} />
              Hidden (not shown to participants)
            </label>
            <Field label="Weight" className="w-24">
              <Input
                type="number"
                min={0.1}
                step={0.1}
                value={tc.weight}
                onChange={(e) => updateCase(i, { weight: Number(e.target.value) || 1 })}
              />
            </Field>
          </div>
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={addCase}>
        + Add test case
      </Button>
    </div>
  );
}

export function CodingSettingsPanel({ config, onChange }: { config: CodingConfig; onChange: (cfg: CodingConfig) => void }) {
  const [starterTab, setStarterTab] = useState(config.languages[0] ?? "");

  function toggleLanguage(id: string) {
    const languages = config.languages.includes(id)
      ? config.languages.filter((l) => l !== id)
      : [...config.languages, id];
    onChange({ ...config, languages });
    if (!config.languages.includes(id) && !starterTab) setStarterTab(id);
  }

  const activeLanguages = config.languages.length > 0 ? config.languages : CODING_LANGUAGES.map((l) => l.id);
  const currentTab = activeLanguages.includes(starterTab) ? starterTab : activeLanguages[0];

  return (
    <div className="space-y-4">
      <Field label="Allowed languages" hint="None selected = all languages allowed">
        <div className="flex flex-wrap gap-3">
          {CODING_LANGUAGES.map((l) => (
            <label key={l.id} className="flex items-center gap-1.5 text-sm text-on-surface">
              <input type="checkbox" checked={config.languages.includes(l.id)} onChange={() => toggleLanguage(l.id)} />
              {l.label}
            </label>
          ))}
        </div>
      </Field>

      <div className="flex flex-wrap gap-4">
        <Field label="Time limit (ms)" className="w-36">
          <Input
            type="number"
            min={100}
            max={15000}
            value={config.timeLimitMs}
            onChange={(e) => onChange({ ...config, timeLimitMs: Number(e.target.value) || 2000 })}
          />
        </Field>
        <Field label="Memory limit (KB)" className="w-36">
          <Input
            type="number"
            min={16000}
            max={512000}
            value={config.memoryLimitKb}
            onChange={(e) => onChange({ ...config, memoryLimitKb: Number(e.target.value) || 128000 })}
          />
        </Field>
      </div>

      <Field label="Starter code" hint="One tab per allowed language">
        <div className="flex flex-wrap gap-1.5 border-b border-outline-variant pb-2">
          {activeLanguages.map((id) => {
            const lang = CODING_LANGUAGES.find((l) => l.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setStarterTab(id)}
                className={
                  "rounded-control px-2.5 py-1 text-xs font-medium " +
                  (currentTab === id ? "bg-accent-soft text-accent" : "text-on-surface-variant hover:bg-surface-container")
                }
              >
                {lang?.label ?? id}
              </button>
            );
          })}
        </div>
        <Textarea
          rows={6}
          className="mt-2 font-mono text-xs"
          value={config.starterCode[currentTab] ?? ""}
          onChange={(e) => onChange({ ...config, starterCode: { ...config.starterCode, [currentTab]: e.target.value } })}
        />
      </Field>

      <TestCaseBuilder config={config} onChange={onChange} />
    </div>
  );
}
