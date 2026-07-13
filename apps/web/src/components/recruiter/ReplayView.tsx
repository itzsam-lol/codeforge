"use client";

/**
 * Session replay (spec 3.5): reconstructs how the candidate's code was
 * written from recorded editor deltas, making "typed incrementally" vs
 * "pasted in one block" immediately visible.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { staffApi } from "@/lib/api";
import { Button, Card, Spinner, cn } from "@/components/ui";
import { IconPause, IconPlay, IconX } from "@/components/icons";

interface Op {
  t: number;
  o: number;
  d: number;
  i: string;
  init?: boolean;
}

interface ReplayPayload {
  batches: { seq: number; ops: Op[] }[];
}

function applyOps(ops: Op[], upTo: number): string {
  let text = "";
  for (let k = 0; k < upTo && k < ops.length; k++) {
    const op = ops[k];
    text = text.slice(0, op.o) + op.i + text.slice(op.o + op.d);
  }
  return text;
}

export function ReplayView({
  sessionId,
  questionId,
  onClose,
}: {
  sessionId: string;
  questionId: string;
  onClose: () => void;
}) {
  const [ops, setOps] = useState<Op[] | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    staffApi<ReplayPayload>(`/api/sessions/${sessionId}/replay/${questionId}`).then((d) => {
      const flat = d.batches.flatMap((b) => b.ops);
      setOps(flat);
      setCursor(flat.length);
    });
  }, [sessionId, questionId]);

  useEffect(() => {
    if (!playing || !ops) return;
    timerRef.current = setInterval(() => {
      setCursor((c) => {
        if (c >= ops.length) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, Math.max(5, 200 / speed));
    return () => clearInterval(timerRef.current);
  }, [playing, speed, ops]);

  const text = useMemo(() => (ops ? applyOps(ops, cursor) : ""), [ops, cursor]);
  const pasteMarkers = useMemo(
    () =>
      ops
        ? ops
            .map((op, idx) => ({ op, idx }))
            .filter(({ op }) => !op.init && op.i.length >= 120)
            .map(({ idx }) => idx)
        : [],
    [ops]
  );

  if (!ops) return <Spinner label="Loading replay…" />;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold">Session replay</span>
          <span className="text-slate-500">
            {cursor}/{ops.length} edits
          </span>
          {pasteMarkers.length > 0 ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
              {pasteMarkers.length} paste-like insert{pasteMarkers.length === 1 ? "" : "s"} ≥120 chars
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
              built incrementally
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          Close <IconX size={12} />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (cursor >= ops.length) setCursor(ops.filter((o) => o.init).length);
            setPlaying((p) => !p);
          }}
        >
          {playing ? (<><IconPause size={12} /> Pause</>) : (<><IconPlay size={12} /> Play</>)}
        </Button>
        <input
          type="range"
          min={0}
          max={ops.length}
          value={cursor}
          onChange={(e) => {
            setPlaying(false);
            setCursor(Number(e.target.value));
          }}
          className="flex-1"
        />
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="rounded border border-slate-300 px-1 py-0.5 text-xs"
        >
          {[1, 5, 10, 25, 50].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>

      {/* Paste markers on the scrub track */}
      {pasteMarkers.length > 0 ? (
        <div className="relative mx-4 mt-1 h-1.5 rounded bg-slate-100">
          {pasteMarkers.map((idx) => (
            <span
              key={idx}
              title={`Paste-like insert at edit ${idx}`}
              className="absolute top-0 h-1.5 w-1 rounded bg-rose-500"
              style={{ left: `${(idx / ops.length) * 100}%` }}
            />
          ))}
        </div>
      ) : null}

      <pre
        className={cn(
          "max-h-80 min-h-40 overflow-auto whitespace-pre-wrap bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100"
        )}
      >
        {text || "(empty)"}
      </pre>
    </Card>
  );
}
