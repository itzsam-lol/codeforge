"use client";

/**
 * Authoring config editors for the four Phase-3 question types. Scalar fields
 * are structured inputs; list/map fields (assertions, HTTP tests, file maps)
 * use validated JSON textareas: pragmatic and fully functional for authoring.
 */
import { useState } from "react";
import type { QuestionType } from "@codeforge/shared";
import { Card, Field, Input, Textarea } from "./ui";

export type Phase3Type = "frontend_ui" | "api_challenge" | "bug_fix" | "repo_project";

export function isPhase3Type(t: QuestionType): t is Phase3Type {
  return ["frontend_ui", "api_challenge", "bug_fix", "repo_project"].includes(t);
}

/** JSON textarea with inline parse feedback; calls onChange only on valid JSON. */
function JsonField({
  label,
  hint,
  value,
  onChange,
  rows = 6,
}: {
  label: string;
  hint?: string;
  value: unknown;
  onChange: (v: unknown) => void;
  rows?: number;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <Field label={label} hint={hint}>
      <Textarea
        mono
        rows={rows}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setErr(null);
          } catch (x) {
            setErr(x instanceof Error ? x.message : "invalid JSON");
          }
        }}
        className={err ? "border-rose-400" : ""}
      />
      {err ? <span className="mt-1 block text-xs text-rose-600">{err}</span> : null}
    </Field>
  );
}

export interface Phase3State {
  frontend: {
    starter: { html: string; css: string; js: string };
    referenceHtml: string;
    referenceCss: string;
    breakpoints: number[];
    assertions: unknown[];
    interactions: unknown[];
    visualWeightPct: number;
    assertionsWeightPct: number;
    interactionsWeightPct: number;
  };
  api: { starterCode: string; port: number; httpTests: unknown[] };
  bugfix: { files: Record<string, string>; sampleTests: Record<string, string>; hiddenTests: Record<string, string> };
  repo: {
    setupCommand: string;
    buildCommand: string;
    testCommand: string;
    buildWeightPct: number;
    testWeightPct: number;
    previewCommand: string;
    previewPort?: number;
    previewRoutes: string[];
  };
}

export function initialPhase3State(type: Phase3Type, cfg: Record<string, unknown>): Phase3State {
  const c = cfg as Record<string, never>;
  return {
    frontend: {
      starter: (cfg.starter as Phase3State["frontend"]["starter"]) ?? { html: "", css: "", js: "" },
      referenceHtml: (cfg.referenceHtml as string) ?? "",
      referenceCss: (cfg.referenceCss as string) ?? "",
      breakpoints: (cfg.breakpoints as number[]) ?? [1280, 375],
      assertions: (cfg.assertions as unknown[]) ?? [],
      interactions: (cfg.interactions as unknown[]) ?? [],
      visualWeightPct: (cfg.visualWeightPct as number) ?? 50,
      assertionsWeightPct: (cfg.assertionsWeightPct as number) ?? 30,
      interactionsWeightPct: (cfg.interactionsWeightPct as number) ?? 20,
    },
    api: {
      starterCode: (cfg.starterCode as string) ?? API_STARTER,
      port: (cfg.port as number) ?? 3000,
      httpTests: (cfg.httpTests as unknown[]) ?? [],
    },
    bugfix: {
      files: (cfg.files as Record<string, string>) ?? {},
      sampleTests: (cfg.sampleTests as Record<string, string>) ?? {},
      hiddenTests: (cfg.hiddenTests as Record<string, string>) ?? {},
    },
    repo: {
      setupCommand: (cfg.setupCommand as string) ?? "npm ci --no-audit --no-fund || npm install --no-audit --no-fund",
      buildCommand: (cfg.buildCommand as string) ?? "",
      testCommand: (cfg.testCommand as string) ?? "",
      buildWeightPct: (cfg.buildWeightPct as number) ?? 40,
      testWeightPct: (cfg.testWeightPct as number) ?? 60,
      previewCommand: (cfg.previewCommand as string) ?? "",
      previewPort: (cfg.previewPort as number) ?? undefined,
      previewRoutes: (cfg.previewRoutes as string[]) ?? ["/"],
    },
  };
  void c;
}

/** Build the API typeConfig payload for the current type from Phase3State. */
export function phase3ToTypeConfig(type: Phase3Type, s: Phase3State): Record<string, unknown> {
  if (type === "frontend_ui") return { ...s.frontend };
  if (type === "api_challenge") return { ...s.api };
  if (type === "bug_fix") return { ...s.bugfix };
  return { ...s.repo };
}

const API_STARTER = `const http = require("http");
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // TODO: implement the required endpoints
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => console.log("listening on " + PORT));
`;

export function Phase3ConfigEditor({
  type,
  state,
  onChange,
}: {
  type: Phase3Type;
  state: Phase3State;
  onChange: (s: Phase3State) => void;
}) {
  const set = <K extends keyof Phase3State>(key: K, value: Phase3State[K]) =>
    onChange({ ...state, [key]: value });

  if (type === "frontend_ui") {
    const f = state.frontend;
    const setF = (patch: Partial<Phase3State["frontend"]>) => set("frontend", { ...f, ...patch });
    return (
      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Frontend UI challenge</h3>
        <p className="text-xs text-slate-500">
          The reference HTML/CSS is rendered server-side into screenshots (never sent to candidates).
          Grading = visual diff + DOM assertions + interactions.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Starter HTML">
            <Textarea mono rows={4} value={f.starter.html} onChange={(e) => setF({ starter: { ...f.starter, html: e.target.value } })} />
          </Field>
          <Field label="Starter CSS">
            <Textarea mono rows={4} value={f.starter.css} onChange={(e) => setF({ starter: { ...f.starter, css: e.target.value } })} />
          </Field>
        </div>
        <Field label="Starter JS">
          <Textarea mono rows={3} value={f.starter.js} onChange={(e) => setF({ starter: { ...f.starter, js: e.target.value } })} />
        </Field>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Reference HTML (recruiter-only)">
            <Textarea mono rows={5} value={f.referenceHtml} onChange={(e) => setF({ referenceHtml: e.target.value })} />
          </Field>
          <Field label="Reference CSS (recruiter-only)">
            <Textarea mono rows={5} value={f.referenceCss} onChange={(e) => setF({ referenceCss: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="Breakpoints (px, comma)">
            <Input
              value={f.breakpoints.join(", ")}
              onChange={(e) => setF({ breakpoints: e.target.value.split(",").map((x) => Number(x.trim())).filter(Boolean) })}
            />
          </Field>
          <Field label="Visual weight %">
            <Input type="number" value={f.visualWeightPct} onChange={(e) => setF({ visualWeightPct: Number(e.target.value) })} />
          </Field>
          <Field label="Assertions weight %">
            <Input type="number" value={f.assertionsWeightPct} onChange={(e) => setF({ assertionsWeightPct: Number(e.target.value) })} />
          </Field>
          <Field label="Interactions weight %">
            <Input type="number" value={f.interactionsWeightPct} onChange={(e) => setF({ interactionsWeightPct: Number(e.target.value) })} />
          </Field>
        </div>
        <JsonField
          label="DOM assertions"
          hint='e.g. [{"label":"has nav","type":"exists","selector":"nav"}]'
          value={f.assertions}
          onChange={(v) => setF({ assertions: v as unknown[] })}
        />
        <JsonField
          label="Interaction tests"
          hint='e.g. [{"label":"hover card","action":"hover","selector":".card","assertType":"exists","assertSelector":".card:hover"}]'
          value={f.interactions}
          onChange={(v) => setF({ interactions: v as unknown[] })}
        />
      </Card>
    );
  }

  if (type === "api_challenge") {
    const a = state.api;
    const setA = (patch: Partial<Phase3State["api"]>) => set("api", { ...a, ...patch });
    return (
      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">API / backend challenge</h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Server port" className="col-span-1">
            <Input type="number" value={a.port} onChange={(e) => setA({ port: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Starter server code (Node built-ins only)">
          <Textarea mono rows={8} value={a.starterCode} onChange={(e) => setA({ starterCode: e.target.value })} />
        </Field>
        <JsonField
          label="HTTP tests"
          rows={10}
          hint='[{"name":"create","method":"POST","path":"/bookmarks","body":"{\\"url\\":\\"x\\"}","expectStatus":201,"isHidden":false,"weight":1}]'
          value={a.httpTests}
          onChange={(v) => setA({ httpTests: v as unknown[] })}
        />
      </Card>
    );
  }

  if (type === "bug_fix") {
    const b = state.bugfix;
    const setB = (patch: Partial<Phase3State["bugfix"]>) => set("bugfix", { ...b, ...patch });
    return (
      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Bug-fix challenge</h3>
        <p className="text-xs text-slate-500">
          Files map is <code>{"{ \"path\": \"contents\" }"}</code>. Hidden tests run with{" "}
          <code>node --test</code> and must go from failing to passing.
        </p>
        <JsonField label="Starter files (candidate-editable)" rows={8} value={b.files} onChange={(v) => setB({ files: v as Record<string, string> })} />
        <JsonField label="Sample tests (shown to candidate)" rows={4} value={b.sampleTests} onChange={(v) => setB({ sampleTests: v as Record<string, string> })} />
        <JsonField label="Hidden test files (grading)" rows={8} value={b.hiddenTests} onChange={(v) => setB({ hiddenTests: v as Record<string, string> })} />
      </Card>
    );
  }

  const r = state.repo;
  const setR = (patch: Partial<Phase3State["repo"]>) => set("repo", { ...r, ...patch });
  return (
    <Card className="space-y-4 p-5">
      <h3 className="text-sm font-semibold">Repo-submission challenge</h3>
      <Field label="Setup command">
        <Input value={r.setupCommand} onChange={(e) => setR({ setupCommand: e.target.value })} />
      </Field>
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Build command (empty = skip)">
          <Input value={r.buildCommand} onChange={(e) => setR({ buildCommand: e.target.value })} placeholder="npm run build" />
        </Field>
        <Field label="Test command (empty = manual review)">
          <Input value={r.testCommand} onChange={(e) => setR({ testCommand: e.target.value })} placeholder="npm test" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Build weight %">
          <Input type="number" value={r.buildWeightPct} onChange={(e) => setR({ buildWeightPct: Number(e.target.value) })} />
        </Field>
        <Field label="Test weight %">
          <Input type="number" value={r.testWeightPct} onChange={(e) => setR({ testWeightPct: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Field label="Preview command (optional)">
          <Input value={r.previewCommand} onChange={(e) => setR({ previewCommand: e.target.value })} placeholder="npm run start" />
        </Field>
        <Field label="Preview port">
          <Input type="number" value={r.previewPort ?? ""} onChange={(e) => setR({ previewPort: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Preview routes (comma)">
          <Input value={r.previewRoutes.join(", ")} onChange={(e) => setR({ previewRoutes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
        </Field>
      </div>
    </Card>
  );
}
