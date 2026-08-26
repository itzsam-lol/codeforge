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
}: {
  options: McqOption[];
  multiple: boolean;
  onSubmit: (selectedOptionIds: string[]) => void;
  submitting: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    if (multiple) {
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelected([id]);
    }
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
