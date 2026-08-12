"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { staffApi, ApiError } from "@/lib/api";
import { Card, EmptyState, ErrorNote, Spinner, cn } from "../ui";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@codeforge/shared";

interface Bucket {
  bucketStartPct: number;
  count: number;
}

interface PerQuestion {
  questionId: string;
  title: string;
  type: string;
  attempts: number;
  cohortSize: number;
  avgScorePct: number | null;
  passRatePct: number | null;
  avgTimeSpentMinutes: number | null;
}

interface Analytics {
  cohortSize: number;
  scoreDistribution: Bucket[];
  avgTimeToCompleteMinutes: number | null;
  perQuestion: PerQuestion[];
}

// Sequential magnitude scale (single hue, light -> dark), derived from the
// org's brand accent via color-mix rather than a fixed hue, so a white-
// labeled client's charts match their color, not CodeForge's default.
const INTENSITY_STEPS = [16, 36, 60, 80, 100];

function intensityStyle(count: number, max: number): CSSProperties {
  if (max <= 0 || count === 0) return { backgroundColor: "var(--color-surface-container-high)" };
  const idx = Math.min(INTENSITY_STEPS.length - 1, Math.floor((count / max) * (INTENSITY_STEPS.length - 1)));
  // Mixes toward the theme's own lowest surface tone, not a hardcoded
  // "white" — in recruiter-dark that's a dark tone, so a low-intensity bar
  // stays visible against the dark page background instead of nearly
  // vanishing (see (dash)/layout.tsx's theme toggle).
  return {
    backgroundColor: `color-mix(in srgb, var(--color-accent) ${INTENSITY_STEPS[idx]}%, var(--color-surface-container-lowest))`,
  };
}

function passRateColor(pct: number | null): string {
  if (pct == null) return "bg-slate-200";
  if (pct >= 70) return "bg-emerald-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

export function AnalyticsTab({ testId }: { testId: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    staffApi<Analytics>(`/api/tests/${testId}/analytics`)
      .then(setData)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load analytics"));
  }, [testId]);

  if (loadError) return <ErrorNote message={loadError} />;
  if (!data) return <Spinner />;
  if (data.cohortSize === 0) {
    return (
      <EmptyState
        title="No completed sessions yet"
        hint="Analytics appear once at least one candidate submits."
      />
    );
  }

  const maxBucket = Math.max(...data.scoreDistribution.map((b) => b.count), 1);
  const maxTime = Math.max(...data.perQuestion.map((q) => q.avgTimeSpentMinutes ?? 0), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-2xl font-semibold">{data.cohortSize}</div>
          <div className="mt-1 text-xs text-slate-500">Completed sessions</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold">
            {data.avgTimeToCompleteMinutes != null ? `${data.avgTimeToCompleteMinutes} min` : "-"}
          </div>
          <div className="mt-1 text-xs text-slate-500">Avg. time to complete</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold">{data.perQuestion.length}</div>
          <div className="mt-1 text-xs text-slate-500">Questions scored</div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Score distribution</h3>
          <span className="text-xs text-slate-500">% of max score, {data.cohortSize} candidate(s)</span>
        </div>
        <div className="flex h-32 items-end gap-1.5">
          {data.scoreDistribution.map((b) => (
            <div key={b.bucketStartPct} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500">{b.count || ""}</span>
              <div
                title={`${b.bucketStartPct}-${b.bucketStartPct + 10}%: ${b.count} candidate(s)`}
                className="w-full rounded-t-sm transition-colors"
                style={{ ...intensityStyle(b.count, maxBucket), height: `${Math.max(4, (b.count / maxBucket) * 100)}px` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-500">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Per-question performance</h3>
          <button
            onClick={() => setShowTable((s) => !s)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {showTable ? "Show bars" : "Show table"}
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Pass rate = scored ≥60% of the question&apos;s points. A near-0% or near-100% pass rate
          may signal a miscalibrated question.
        </p>

        {showTable ? (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-xs">
            <thead>
              <tr className="bg-surface-container-low text-left text-slate-500">
                <th className="py-1.5 pr-2 font-medium">Question</th>
                <th className="px-2 py-1.5 font-medium">Type</th>
                <th className="px-2 py-1.5 font-medium">Attempts</th>
                <th className="px-2 py-1.5 font-medium">Avg score</th>
                <th className="px-2 py-1.5 font-medium">Pass rate</th>
                <th className="px-2 py-1.5 font-medium">Avg time</th>
              </tr>
            </thead>
            <tbody>
              {data.perQuestion.map((q) => (
                <tr key={q.questionId} className="even:bg-surface-container-low/40">
                  <td className="py-1.5 pr-2 font-medium">{q.title}</td>
                  <td className="px-2 py-1.5 text-slate-500">
                    {QUESTION_TYPE_LABELS[q.type as QuestionType] ?? q.type}
                  </td>
                  <td className="px-2 py-1.5">
                    {q.attempts}/{q.cohortSize}
                  </td>
                  <td className="px-2 py-1.5">{q.avgScorePct != null ? `${q.avgScorePct}%` : "-"}</td>
                  <td className="px-2 py-1.5">{q.passRatePct != null ? `${q.passRatePct}%` : "-"}</td>
                  <td className="px-2 py-1.5">
                    {q.avgTimeSpentMinutes != null ? `${q.avgTimeSpentMinutes} min` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="space-y-3">
            {data.perQuestion.map((q) => (
              <div key={q.questionId}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{q.title}</span>
                  <span className="text-slate-500">
                    {q.attempts}/{q.cohortSize} attempted
                    {q.avgTimeSpentMinutes != null ? ` · ~${q.avgTimeSpentMinutes} min avg` : ""}
                  </span>
                </div>
                <div
                  title={
                    q.passRatePct != null
                      ? `${q.passRatePct}% pass rate, ${q.avgScorePct}% avg score`
                      : "No attempts yet"
                  }
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                >
                  <div
                    className={cn("h-full rounded-full transition-all", passRateColor(q.passRatePct))}
                    style={{ width: `${q.passRatePct ?? 0}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-4 pt-1 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> pass rate ≥70%
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> 40-70%
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> &lt;40%
              </span>
            </div>
          </div>
        )}
      </Card>

      {data.perQuestion.some((q) => q.avgTimeSpentMinutes != null) ? (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Time spent per question</h3>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {data.perQuestion.map((q) => (
              <div
                key={q.questionId}
                title={`${q.title}: ~${q.avgTimeSpentMinutes ?? 0} min avg`}
                className={cn(
                  "flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] font-medium",
                  (q.avgTimeSpentMinutes ?? 0) / maxTime > 0.55 ? "text-white" : "text-on-surface"
                )}
                style={intensityStyle(q.avgTimeSpentMinutes ?? 0, maxTime)}
              >
                {q.avgTimeSpentMinutes != null ? `${q.avgTimeSpentMinutes}m` : "-"}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
