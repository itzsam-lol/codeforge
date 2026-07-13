"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { staffApi } from "@/lib/api";
import { Badge, Card, EmptyState, Spinner, statusBadgeColor } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import {
  IconCheckCircle,
  IconClock,
  IconList,
  IconMonitor,
  IconFlag,
  IconCode,
} from "@/components/icons";
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

  const cards: { label: string; value: number; icon: ReactNode }[] = [
    { label: "Tests", value: stats.tests, icon: <IconList size={16} /> },
    { label: "Published", value: stats.published, icon: <IconCheckCircle size={16} /> },
    { label: "Questions in bank", value: stats.questions, icon: <IconCode size={16} /> },
    { label: "Candidates invited", value: stats.invitations, icon: <IconFlag size={16} /> },
    { label: "In progress now", value: stats.inProgress, icon: <IconClock size={16} /> },
    { label: "Completed", value: stats.completed, icon: <IconMonitor size={16} /> },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-headline-md text-on-surface">Dashboard</h1>
      <div className="cf-stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              {c.icon}
              <span className="text-label-caps">{c.label}</span>
            </div>
            <div className="mt-2 text-2xl font-semibold text-on-surface">{c.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="border-b border-outline-variant px-5 py-3 text-sm font-semibold text-on-surface">
          Recent tests
        </div>
        {tests.length === 0 ? (
          <EmptyState title="No tests yet" hint="Create one from the Tests page." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Test</Th>
                <Th>Status</Th>
                <Th>Questions</Th>
                <Th>Invited</Th>
                <Th>Completed</Th>
                <Th>Updated</Th>
              </tr>
            </Thead>
            <Tbody>
              {tests.slice(0, 8).map((t) => (
                <Tr key={t.id}>
                  <Td className="pl-5">
                    <Link href={`/tests/${t.id}`} className="font-medium text-accent hover:underline">
                      {t.title}
                    </Link>
                  </Td>
                  <Td>
                    <Badge color={statusBadgeColor(t.status)}>{titleCase(t.status)}</Badge>
                  </Td>
                  <Td>{t.counts.questions}</Td>
                  <Td>{t.counts.invited}</Td>
                  <Td>{t.counts.completed}</Td>
                  <Td className="text-on-surface-variant">{fmtDateTime(t.updatedAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
