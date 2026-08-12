"use client";

import type { CandidateQuestion } from "@codeforge/shared";
import { Markdown } from "@/components/Markdown";
import { IconCheck } from "@/components/icons";
import { cn } from "@/components/ui";
import type { Answer } from "./TestRunner";

export function McqWorkspace({
  question,
  answer,
  onChange,
}: {
  question: CandidateQuestion;
  answer: Answer | undefined;
  onChange: (a: Answer) => void;
}) {
  let selected: string[] = [];
  try {
    selected = answer
      ? ((JSON.parse(answer.content) as { selectedOptionIds?: string[] }).selectedOptionIds ?? [])
      : [];
  } catch {
    selected = [];
  }

  function toggle(id: string) {
    const next = question.multiple
      ? selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
      : [id];
    onChange({ content: JSON.stringify({ selectedOptionIds: next }) });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-on-surface-variant">
        {question.multiple ? "Select all that apply." : "Select one answer."}
        {question.hasNegativeMarking ? " Wrong answers deduct points; unanswered scores zero." : ""}
      </p>
      {(question.options ?? []).map((opt) => {
        const isSelected = selected.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl bg-surface-container-lowest px-4 py-3 text-left text-sm transition-all duration-150 hover:shadow-sm",
              isSelected
                ? "bg-accent/10 ring-2 ring-accent ring-inset"
                : "hover:bg-surface-container-low"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors",
                question.multiple ? "rounded" : "rounded-full",
                isSelected ? "border-accent bg-accent text-white" : "border-outline-variant text-transparent"
              )}
            >
              <IconCheck size={12} strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1">
              <Markdown>{opt.textMd}</Markdown>
              {opt.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.imageUrl} alt="" className="mt-2 max-h-48 rounded-lg" />
              ) : null}
            </span>
          </button>
        );
      })}
      {selected.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange({ content: JSON.stringify({ selectedOptionIds: [] }) })}
          className="text-xs font-medium text-on-surface-variant hover:text-on-surface"
        >
          Clear selection
        </button>
      ) : null}
    </div>
  );
}
