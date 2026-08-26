"use client";

import { useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/arena/CodeEditor";
import { EnvCheck } from "@/components/arena/EnvCheck";
import { useArenaProctoring } from "@/lib/arenaProctoring";

const DEMO_CODE = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}
`;

const MECHANISMS = [
  { key: "basic", label: "Tab-switch detection", detail: "Leaving this tab is detected and logged live, below." },
  { key: "strict", label: "Copy/paste blocking", detail: "Try pasting into the editor or copying the problem text — it's genuinely blocked." },
  { key: "lockdown", label: "Webcam monitoring", detail: "A real camera preview, requested with your explicit consent." },
];

export default function ArenaProctoringDemoPage() {
  const [level, setLevel] = useState<"basic" | "strict" | "lockdown">("strict");
  const [checkedIn, setCheckedIn] = useState(false);
  const [code, setCode] = useState(DEMO_CODE);
  const { events } = useArenaProctoring({ level, active: checkedIn });

  return (
    <section className="px-6 py-16">
      <Reveal className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-soft">
          <ShieldCheck className="size-3.5" /> Live proctoring demo
        </span>
        <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
          This is real enforcement, not a mockup
        </h1>
        <p className="mt-3 text-slate-400">
          No account needed. Grant the permissions below and interact with the editor — every signal is
          genuinely detected by your browser, exactly as it would be in a real contest.
        </p>
      </Reveal>

      {!checkedIn ? (
        <div className="mx-auto mt-10 max-w-lg">
          <div className="mb-6 flex justify-center gap-2">
            {(["basic", "strict", "lockdown"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition ${
                  level === l ? "bg-accent text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <EnvCheck
            level={level}
            webcamRequired={level === "lockdown"}
            fullscreenRequired={false}
            onReady={() => setCheckedIn(true)}
          />
        </div>
      ) : (
        <div className="mx-auto mt-10 max-w-5xl">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {MECHANISMS.map((m) => (
              <div key={m.key} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-medium text-white">{m.label}</div>
                <div className="mt-1 text-xs text-slate-400">{m.detail}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <div
              className="h-80"
              onCopyCapture={(e) => {
                if (level === "strict" || level === "lockdown") e.preventDefault();
              }}
            >
              <CodeEditor
                language="javascript"
                value={code}
                onChange={setCode}
                blockPaste={level === "strict" || level === "lockdown"}
              />
            </div>
            <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-4 py-2.5">
              <span className="text-xs text-slate-400">
                {events.length === 0
                  ? "No events yet — try switching tabs or pasting something."
                  : `Last event: ${events[events.length - 1].type.replace(/_/g, " ")}`}
              </span>
              <Button href="/arena/auth/register" size="sm">
                Create a free account to run this
              </Button>
            </div>
          </div>

          {events.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <h3 className="flex items-center gap-2 text-sm font-medium text-amber-300">
                <AlertTriangle className="size-4" /> Live event log ({events.length})
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {events.map((e, i) => (
                  <span key={i} className="rounded-full bg-black/30 px-2.5 py-1 text-xs text-amber-200">
                    {e.type.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
