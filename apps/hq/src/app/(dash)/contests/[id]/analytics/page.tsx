"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { hqApi, ApiError } from "@/lib/api";
import { Card, EmptyState, ErrorNote, Spinner } from "@/components/ui";

interface QuestionAnalytics {
  contestQuestionId: string;
  seq: number;
  title: string;
  totalSubmissions: number;
  attemptedCount: number;
  acceptedCount: number;
  acceptanceRatePct: number;
}

interface ContestAnalytics {
  registeredCount: number;
  averageScore: number;
  proctoringDistribution: Record<string, number>;
  aiFlagCount: number;
  questions: QuestionAnalytics[];
}

const PROCTORING_LABELS: Record<string, string> = { none: "None", webcam: "Webcam", lockdown: "Lockdown" };
const PROCTORING_COLORS: Record<string, string> = { none: "bg-outline-variant", webcam: "bg-warn", lockdown: "bg-accent" };

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <div className="text-2xl font-semibold text-on-surface">{value}</div>
      <div className="mt-1 text-xs text-on-surface-variant">{label}</div>
    </Card>
  );
}

export default function ContestAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useSWR<ContestAnalytics>(`/api/contests/${id}/analytics`, hqApi);
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load analytics" : null;

  if (loadError) return <ErrorNote message={loadError} />;
  if (!data) return <Spinner />;

  const maxProctoring = Math.max(1, ...Object.values(data.proctoringDistribution));

  return (
    <div className="space-y-4">
      <h1 className="text-headline-md text-on-surface">Contest analytics</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Registered participants" value={data.registeredCount} />
        <StatCard label="Average score" value={data.averageScore} />
        <StatCard label="AI flags" value={data.aiFlagCount} />
        <StatCard label="Questions" value={data.questions.length} />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-on-surface">Proctoring level distribution</h2>
        <div className="mt-4 space-y-3">
          {Object.entries(data.proctoringDistribution).map(([level, count]) => (
            <div key={level} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-on-surface-variant">{PROCTORING_LABELS[level] ?? level}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className={`h-full ${PROCTORING_COLORS[level] ?? "bg-outline-variant"}`}
                  style={{ width: `${(count / maxProctoring) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-medium text-on-surface">{count}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-on-surface">Per-question breakdown</h2>
        {data.questions.length === 0 ? (
          <EmptyState title="No questions" />
        ) : (
          <div className="mt-4 divide-y divide-outline-variant">
            {data.questions.map((q) => (
              <div key={q.contestQuestionId} className="flex items-center justify-between gap-4 py-3">
                <span className="min-w-0 truncate text-sm text-on-surface">
                  {q.seq}. {q.title}
                </span>
                <span className="shrink-0 text-xs text-on-surface-variant">{q.totalSubmissions} submissions</span>
                <span className="shrink-0 text-xs text-on-surface-variant">{q.attemptedCount} attempted</span>
                <span className="shrink-0 text-xs font-medium text-on-surface">{q.acceptanceRatePct}% accepted</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
