"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Button, cn } from "@/components/ui";

/**
 * A single static, non-scored sample question so a candidate can see what
 * answering actually feels like before the real timer starts. Deliberately
 * scoped to one hardcoded MCQ, not a real coding sandbox — that would need
 * the actual grading pipeline, which is a much bigger feature than "let me
 * click around first." No server round-trip, no persistence.
 */
const SAMPLE_OPTIONS = [
  { id: "a", text: "It only runs once, after the component's first render." },
  { id: "b", text: "It runs after every render, including the first." },
  { id: "c", text: "It never runs during development mode." },
  { id: "d", text: "It only runs when the component unmounts." },
];
const SAMPLE_CORRECT = "a";

export function PracticeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  function close() {
    setSelected(null);
    setChecked(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Practice question">
      <p className="text-xs font-medium uppercase tracking-wide text-warn">
        Not scored — doesn&apos;t affect your real test
      </p>
      <p className="mt-3 text-sm text-on-surface">
        In React, a <code className="rounded bg-surface-container-high px-1 py-0.5 text-code-md">useEffect(fn, [])</code>{" "}
        call with an empty dependency array runs when?
      </p>
      <div className="mt-3 space-y-2">
        {SAMPLE_OPTIONS.map((opt) => (
          <label
            key={opt.id}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-sm",
              selected === opt.id
                ? "bg-accent-soft ring-2 ring-accent ring-inset"
                : "bg-surface-container-lowest hover:bg-surface-container-low"
            )}
          >
            <input
              type="radio"
              name="practice-answer"
              checked={selected === opt.id}
              onChange={() => {
                setSelected(opt.id);
                setChecked(false);
              }}
              className="accent-accent"
            />
            {opt.text}
          </label>
        ))}
      </div>
      {checked ? (
        <p className={cn("mt-3 text-sm font-medium", selected === SAMPLE_CORRECT ? "text-ok" : "text-bad")}>
          {selected === SAMPLE_CORRECT
            ? "Correct. That's the pattern this platform's MCQ questions use."
            : "Not quite — the correct answer is the first option. In a real question, this is where feedback on scoring would come from a reviewer, not the page itself."}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" disabled={!selected} onClick={() => setChecked(true)}>
          Check answer
        </Button>
        <Button variant="secondary" onClick={close} className="ml-auto">
          Done practicing
        </Button>
      </div>
    </Modal>
  );
}
