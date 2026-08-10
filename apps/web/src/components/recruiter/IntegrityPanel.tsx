"use client";

import { useEffect, useState } from "react";
import { PROCTORING_EVENT_LABELS, type ProctoringEventType } from "@codeforge/shared";
import { staffApi } from "@/lib/api";
import { Badge, Card, Spinner, cn } from "@/components/ui";

interface IntegrityPayload {
  integrity: { score: number; deductions: { type: string; count: number; deducted: number }[] };
  timeline: { type: string; severity: number; metadata: Record<string, unknown>; createdAt: string }[];
  snapshots: { url: string; at: string; facePresent: boolean | null; kind: string }[];
}

function label(type: string): string {
  return PROCTORING_EVENT_LABELS[type as ProctoringEventType] ?? type;
}

const severityColors = ["slate", "slate", "amber", "red"] as const;

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
  const scoreColor =
    integrity.score >= 85 ? "text-emerald-600" : integrity.score >= 60 ? "text-amber-600" : "text-rose-600";
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
          <div className={cn("text-3xl font-bold tabular-nums", scoreColor)}>{integrity.score}</div>
          <div className="text-xs text-slate-500">/ 100</div>
        </div>
      </div>

      {integrity.deductions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {integrity.deductions.map((d) => (
            <Badge key={d.type} color={d.deducted >= 10 ? "red" : "amber"}>
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
              <Badge key={i} color={e.severity >= 3 ? "red" : "amber"}>
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
                <Badge color={severityColors[Math.min(3, e.severity)] as "slate" | "amber" | "red"}>
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
                    "h-20 rounded-lg border-2 object-cover",
                    s.facePresent === false ? "border-rose-400" : "border-slate-200"
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
