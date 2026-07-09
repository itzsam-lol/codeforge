"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { staffApi } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Spinner, statusBadgeColor } from "../ui";
import { fmtDateTime, fmtScore, titleCase } from "@/lib/format";

interface ResultRow {
  sessionId: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  submittedAt: string | null;
  totalScore: number;
  maxScore: number;
  gradingPending: boolean;
  timeTakenMinutes: number | null;
  integrityScore: number | null;
  plagiarismMaxPct: number | null;
}

interface ResultsPayload {
  summary: {
    invited: number;
    started: number;
    completed: number;
    averageScore: number | null;
  };
  sessions: ResultRow[];
}

export function ResultsTab({ testId }: { testId: string }) {
  const [data, setData] = useState<ResultsPayload | null>(null);

  const load = useCallback(() => {
    staffApi<ResultsPayload>(`/api/tests/${testId}/results`).then(setData);
  }, [testId]);

  useEffect(load, [load]);

  if (!data) return <Spinner />;

  const cards = [
    { label: "Invited", value: data.summary.invited },
    { label: "Started", value: data.summary.started },
    { label: "Completed", value: data.summary.completed },
    { label: "Average score", value: data.summary.averageScore ?? "—" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.label} className="p-4">
              <div className="text-2xl font-semibold">{c.value}</div>
              <div className="mt-1 text-xs text-slate-500">{c.label}</div>
            </Card>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={load} className="ml-3">
          Refresh
        </Button>
      </div>

      <Card>
        {data.sessions.length === 0 ? (
          <EmptyState title="No sessions yet" hint="Results appear as soon as candidates open their links." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2 font-medium">Candidate</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium" title="Integrity signal — for human review, never an automatic verdict">
                  Integrity
                </th>
                <th className="px-3 py-2 font-medium">Similarity</th>
                <th className="px-3 py-2 font-medium">Time taken</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.sessionId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{s.candidateName}</div>
                    <div className="text-xs text-slate-400">{s.candidateEmail}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={statusBadgeColor(s.status)}>{titleCase(s.status)}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-semibold">{fmtScore(s.totalScore, s.maxScore)}</span>
                    {s.gradingPending ? (
                      <Badge color="amber">grading…</Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.integrityScore != null ? (
                      <Badge
                        color={s.integrityScore >= 85 ? "green" : s.integrityScore >= 60 ? "amber" : "red"}
                      >
                        {s.integrityScore}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.plagiarismMaxPct != null ? (
                      <Badge color={s.plagiarismMaxPct >= 70 ? "red" : s.plagiarismMaxPct >= 40 ? "amber" : "slate"}>
                        {s.plagiarismMaxPct}%
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.timeTakenMinutes != null ? `${s.timeTakenMinutes} min` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{fmtDateTime(s.submittedAt)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/sessions/${s.sessionId}`}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
