"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { staffApi } from "@/lib/api";
import { Badge, Card, EmptyState, Spinner, statusBadgeColor } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

interface Stats {
  tests: number;
  published: number;
  invitations: number;
  completed: number;
  inProgress: number;
  questions: number;
}

interface TestRow {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  updatedAt: string;
  counts: { questions: number; invited: number; inProgress: number; completed: number };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tests, setTests] = useState<TestRow[] | null>(null);

  useEffect(() => {
    staffApi<{ stats: Stats }>("/api/dashboard").then((d) => setStats(d.stats));
    staffApi<{ tests: TestRow[] }>("/api/tests").then((d) => setTests(d.tests));
  }, []);

  if (!stats || !tests) return <Spinner />;

  const cards = [
    { label: "Tests", value: stats.tests },
    { label: "Published", value: stats.published },
    { label: "Questions in bank", value: stats.questions },
    { label: "Candidates invited", value: stats.invitations },
    { label: "In progress now", value: stats.inProgress },
    { label: "Completed", value: stats.completed },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="cf-stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-2xl font-semibold text-slate-900">{c.value}</div>
            <div className="mt-1 text-xs text-slate-500">{c.label}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">Recent tests</div>
        {tests.length === 0 ? (
          <EmptyState title="No tests yet" hint="Create one from the Tests page." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2 font-medium">Test</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Questions</th>
                <th className="px-3 py-2 font-medium">Invited</th>
                <th className="px-3 py-2 font-medium">Completed</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tests.slice(0, 8).map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-2.5">
                    <Link href={`/tests/${t.id}`} className="font-medium text-indigo-700 hover:underline">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={statusBadgeColor(t.status)}>{titleCase(t.status)}</Badge>
                  </td>
                  <td className="px-3 py-2.5">{t.counts.questions}</td>
                  <td className="px-3 py-2.5">{t.counts.invited}</td>
                  <td className="px-3 py-2.5">{t.counts.completed}</td>
                  <td className="px-3 py-2.5 text-slate-500">{fmtDateTime(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
