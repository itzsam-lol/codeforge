"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface McqOption {
  id: string;
  text: string;
}

export function McqPanel({
  options,
  multiple,
  onSubmit,
  submitting,
  alreadyAnswered = false,
}: {
  options: McqOption[];
  multiple: boolean;
  onSubmit: (selectedOptionIds: string[]) => void;
  submitting: boolean;
  /** MCQ answers are one-shot and locked in (BUG-1) — once true, the
   *  interactive panel is replaced by a neutral confirmation, never
   *  revealing correct/incorrect until the contest is graded. */
  alreadyAnswered?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    if (multiple) {
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelected([id]);
    }
  }

  if (alreadyAnswered) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="text-sm font-medium text-white">Answer recorded</div>
        <p className="max-w-xs text-xs text-slate-400">
          Your answer is locked in. Results are revealed once the contest ends and grading is complete.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex-1 space-y-2.5 overflow-y-auto">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition",
                isSelected
                  ? "border-accent bg-accent/10 text-white"
                  : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/[0.08]"
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center border text-[10px]",
                  multiple ? "rounded" : "rounded-full",
                  isSelected ? "border-accent bg-accent text-white" : "border-white/30"
                )}
              >
                {isSelected ? "✓" : ""}
              </span>
              {opt.text}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => onSubmit(selected)}
        disabled={selected.length === 0 || submitting}
        className="mt-4 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Submitting…" : "Submit answer"}
      </button>
    </div>
  );
}
