"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Code2, ListChecks, LayoutPanelLeft, Bug, Server, GitBranch, Check } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { cn } from "@/lib/utils";

type Assessment = {
  id: string;
  icon: typeof Code2;
  title: string;
  tagline: string;
  body: string;
  highlights: string[];
  code: { lang: string; lines: { text: string; tone?: "kw" | "fn" | "str" | "com" | "num" }[] };
};

const assessments: Assessment[] = [
  {
    id: "dsa",
    icon: Code2,
    title: "DSA / Coding",
    tagline: "Algorithmic depth, graded objectively",
    body: "Classic data-structures and algorithms problems, run against hidden test cases in a sandboxed execution runtime with strict time and memory limits.",
    highlights: ["8 languages sandboxed", "Hidden + sample test cases", "Time and memory limits", "Partial-credit scoring"],
    code: {
      lang: "solution.ts",
      lines: [
        { text: "// Longest substring without repeating chars", tone: "com" },
        { text: "function lengthOfLongest(s: string): number {", tone: "kw" },
        { text: "  const seen = new Map<string, number>();" },
        { text: "  let start = 0, best = 0;" },
        { text: "  for (let i = 0; i < s.length; i++) {", tone: "kw" },
        { text: "    // slide the window forward", tone: "com" },
        { text: "    best = Math.max(best, i - start + 1);", tone: "fn" },
        { text: "  }" },
        { text: "  return best;", tone: "kw" },
        { text: "}" },
      ],
    },
  },
  {
    id: "mcq",
    icon: ListChecks,
    title: "MCQ / MSQ",
    tagline: "Fast concept screening",
    body: "Single and multi-select questions for concept checks and early screening rounds, with negative marking and per-question analytics.",
    highlights: ["Single and multi-select", "Optional negative marking", "Randomized option order", "Instant auto-grading"],
    code: {
      lang: "question.md",
      lines: [
        { text: "Which are true of a hash map?", tone: "com" },
        { text: "" },
        { text: "[x] Average O(1) lookup", tone: "str" },
        { text: "[x] Handles collisions via chaining", tone: "str" },
        { text: "[ ] Keeps keys sorted", tone: "num" },
        { text: "[x] Backs most dedup workloads", tone: "str" },
        { text: "" },
        { text: "// 3 of 4 correct, MSQ partial credit", tone: "com" },
      ],
    },
  },
  {
    id: "frontend",
    icon: LayoutPanelLeft,
    title: "Frontend UI",
    tagline: "Real markup, visually graded",
    body: "Candidates write HTML, CSS, and JavaScript in a live editor. Submissions are rendered headlessly and compared against a reference design.",
    highlights: ["Live preview iframe", "Pixel-diff against reference", "DOM and interaction checks", "Responsive breakpoints"],
    code: {
      lang: "index.html",
      lines: [
        { text: "<button class=\"cta\">", tone: "kw" },
        { text: "  Get started", tone: "str" },
        { text: "</button>", tone: "kw" },
        { text: "" },
        { text: ".cta {", tone: "fn" },
        { text: "  background: var(--accent);" },
        { text: "  border-radius: 12px;", tone: "num" },
        { text: "}" },
        { text: "// rendered + diffed vs reference", tone: "com" },
      ],
    },
  },
  {
    id: "bugfix",
    icon: Bug,
    title: "Bug Fix",
    tagline: "Debugging under real constraints",
    body: "Candidates are handed a broken starter project and must patch it so a hidden test suite passes, testing debugging skill, not blank-page recall.",
    highlights: ["Multi-file starter repo", "Hidden test suite", "Scoped editable paths", "TAP test output"],
    code: {
      lang: "cart.test.js",
      lines: [
        { text: "test('applies discount once', () => {", tone: "fn" },
        { text: "  const cart = new Cart(items);" },
        { text: "  cart.applyCoupon('SAVE10');", tone: "str" },
        { text: "  cart.applyCoupon('SAVE10');", tone: "str" },
        { text: "  // bug: coupon stacked twice", tone: "com" },
        { text: "  expect(cart.total).toBe(90);", tone: "num" },
        { text: "});" },
        { text: "✓ 6 passing  ✗ 1 failing", tone: "com" },
      ],
    },
  },
  {
    id: "api",
    icon: Server,
    title: "API / Backend Challenge",
    tagline: "Servers, exercised for real",
    body: "The candidate's server boots in an isolated container and is exercised by scripted HTTP tests: status codes, payloads, auth, and edge cases.",
    highlights: ["Isolated per-run container", "Scripted request suite", "No published ports", "Latency and status assertions"],
    code: {
      lang: "server.js",
      lines: [
        { text: "app.post('/orders', (req, res) => {", tone: "fn" },
        { text: "  const { items } = req.body;" },
        { text: "  if (!items?.length)", tone: "kw" },
        { text: "    return res.status(400).json({", tone: "num" },
        { text: "      error: 'empty order'", tone: "str" },
        { text: "    });" },
        { text: "  // graded: 201, schema, idempotency", tone: "com" },
        { text: "});" },
      ],
    },
  },
  {
    id: "repo",
    icon: GitBranch,
    title: "Repo Project",
    tagline: "Take-home, sandboxed end to end",
    body: "Candidates submit a repository URL. CodeForge clones, installs, builds, and tests it inside a sandboxed, egress-restricted pipeline.",
    highlights: ["Clone, install, build, test", "Egress-restricted pipeline", "Git history inspection", "Optional preview screenshots"],
    code: {
      lang: "pipeline.log",
      lines: [
        { text: "$ git clone --depth 1 <repo>", tone: "com" },
        { text: "→ install dependencies", tone: "fn" },
        { text: "→ build project", tone: "fn" },
        { text: "→ run test suite", tone: "fn" },
        { text: "✓ build passed", tone: "str" },
        { text: "✓ 42/45 tests passed", tone: "str" },
        { text: "→ egress: allowlist only", tone: "com" },
      ],
    },
  },
];

const toneColor: Record<string, string> = {
  kw: "text-indigo-300",
  fn: "text-emerald-300",
  str: "text-amber-300",
  com: "text-slate-500",
  num: "text-sky-300",
};

export function AssessmentShowcase() {
  const [active, setActive] = useState(assessments[0].id);
  const current = assessments.find((a) => a.id === active)!;

  return (
    <section id="assessments" className="relative overflow-hidden bg-white py-20 md:py-28">
      <div aria-hidden className="cf-grid-light cf-radial-mask pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Assessment types"
          title={<>One platform, six real assessment types</>}
          subtitle="Built for engineering hiring specifically, not adapted from a generic quiz tool. Pick a format to see how it works."
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-[300px_1fr]">
          {/* selector */}
          <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {assessments.map((a) => {
              const isActive = a.id === active;
              return (
                <button
                  key={a.id}
                  onClick={() => setActive(a.id)}
                  className={cn(
                    "group relative flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 lg:w-full",
                    isActive
                      ? "border-accent/30 bg-accent/5 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                      isActive ? "bg-accent text-white" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                    )}
                  >
                    <a.icon className="size-4.5" />
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-semibold", isActive ? "text-slate-900" : "text-slate-700")}>
                      {a.title}
                    </span>
                    <span className="hidden truncate text-xs text-slate-500 lg:block">{a.tagline}</span>
                  </span>
                  {isActive && (
                    <motion.span
                      layoutId="assessment-active"
                      className="absolute inset-y-2 -left-px w-0.5 rounded-full bg-accent lg:block"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* detail panel */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="grid gap-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-6 md:grid-cols-2 md:p-8"
            >
              <div>
                <div className="flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <current.icon className="size-5" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">{current.title}</h3>
                <p className="mt-1 text-sm font-medium text-accent">{current.tagline}</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{current.body}</p>
                <ul className="mt-5 grid gap-2">
                  {current.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2 text-sm text-slate-700">
                      <span className="flex size-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Check className="size-3" />
                      </span>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              {/* code mock */}
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0a0e1f] shadow-lg">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                  <span className="size-2.5 rounded-full bg-rose-400/60" />
                  <span className="size-2.5 rounded-full bg-amber-400/60" />
                  <span className="size-2.5 rounded-full bg-emerald-400/60" />
                  <span className="ml-3 font-mono text-xs text-slate-400">{current.code.lang}</span>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed">
                  {current.code.lines.map((l, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="w-4 select-none text-right text-slate-600">{l.text ? i + 1 : ""}</span>
                      <span className={l.tone ? toneColor[l.tone] : "text-slate-200"}>{l.text || " "}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
