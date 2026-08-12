"use client";

import { useEffect, useState } from "react";
import { PROCTORING_EVENT_LABELS, type ProctoringEventType } from "@codeforge/shared";
import { staffApi } from "@/lib/api";
import { Badge, Card, Spinner, cn } from "@/components/ui";
import { integrityScoreColor } from "@/lib/format";

interface IntegrityPayload {
  integrity: { score: number; deductions: { type: string; count: number; deducted: number }[] };
  timeline: { type: string; severity: number; metadata: Record<string, unknown>; createdAt: string }[];
  snapshots: { url: string; at: string; facePresent: boolean | null; kind: string }[];
}

function label(type: string): string {
  return PROCTORING_EVENT_LABELS[type as ProctoringEventType] ?? type;
}

const severityColors = ["neutral", "neutral", "warn", "bad"] as const;

// One-time hardware/environment checks (EnvCheck.tsx) — shown as a session-
// start snapshot, separate from the continuous behavioral timeline below,
// since "did this check pass" and "what happened during the test" are
// different questions for a reviewer.
const HW_EVENT_TYPES = new Set<string>([
  "vm_suspected",
  "virtual_camera_suspected",
  "automation_browser_suspected",
  "hardware_below_floor",
  "virtual_network_adapter",
]);

export function IntegrityPanel({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<IntegrityPayload | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    staffApi<IntegrityPayload>(`/api/sessions/${sessionId}/integrity`).then(setData);
  }, [sessionId]);

  if (!data) return <Spinner label="Loading integrity data…" />;
  const { integrity, timeline: fullTimeline, snapshots } = data;
  const envChecks = fullTimeline.filter((e) => HW_EVENT_TYPES.has(e.type));
  const timeline = fullTimeline.filter((e) => !HW_EVENT_TYPES.has(e.type));
  const scoreColor = integrityScoreColor(integrity.score);
  const shown = expanded ? timeline : timeline.slice(-8);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Integrity</h3>
          <p className="mt-0.5 max-w-md text-xs text-slate-500">
            This score is a <b>signal for human review, not a verdict</b>. False positives happen
            (e.g. a notification stealing focus). Always check the timeline before acting on it.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-semibold tabular-nums" style={{ color: scoreColor }}>
            {integrity.score}
          </div>
          <div className="text-xs text-slate-500">/ 100</div>
        </div>
      </div>

      {/* Continuous 0-100 ramp, no threshold cliff: a 62 and a 58 read as
          neighbours, never a pass/fail jump at some arbitrary cutoff. */}
      <div className="mt-4">
        <div className="relative h-2 rounded-full bg-gradient-to-r from-bad via-warn to-ok">
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `calc(${integrity.score}% - 7px)`, backgroundColor: scoreColor }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[11px] text-slate-400">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>

      {integrity.deductions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {integrity.deductions.map((d) => (
            <Badge key={d.type} color={d.deducted >= 10 ? "bad" : "warn"}>
              {label(d.type)} ×{d.count} (−{d.deducted})
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-emerald-700">No integrity signals recorded.</p>
      )}

      <div className="mt-4">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Environment (session start)
        </h4>
        {envChecks.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {envChecks.map((e, i) => (
              <Badge key={i} color={e.severity >= 3 ? "bad" : "warn"}>
                {label(e.type)}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-emerald-700">No hardware/environment checks were flagged.</p>
        )}
      </div>

      {timeline.length > 0 ? (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Event timeline ({timeline.length})
            </h4>
            {timeline.length > 8 ? (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="text-xs font-medium text-accent hover:underline"
              >
                {expanded ? "Show recent" : "Show all"}
              </button>
            ) : null}
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {shown.map((e, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                <Badge color={severityColors[Math.min(3, e.severity)]}>
                  {label(e.type)}
                </Badge>
                {typeof e.metadata?.chars === "number" ? (
                  <span className="text-slate-500">{String(e.metadata.chars)} chars</span>
                ) : null}
                <span className="ml-auto tabular-nums text-slate-500">
                  {new Date(e.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {snapshots.length > 0 ? (
        <div className="mt-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Webcam snapshots ({snapshots.length})
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {snapshots.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.url}
                  alt={`Snapshot ${i + 1}`}
                  className={cn(
                    "h-20 rounded-lg object-cover shadow-[var(--shadow-card)]",
                    s.facePresent === false && "ring-2 ring-rose-400"
                  )}
                />
                <div className="mt-0.5 text-center text-[10px] text-slate-500">
                  {s.kind === "identity" ? "ID" : new Date(s.at).toLocaleTimeString()}
                  {s.facePresent === false ? " · no face" : ""}
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
