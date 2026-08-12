"use client";

import { useMemo, useState, type FormEvent } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { staffApi, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { fmtDateTime } from "@/lib/format";

interface TestRow {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  updatedAt: string;
  counts: { questions: number; invited: number; inProgress: number; completed: number };
}

export default function TestsPage() {
  const router = useRouter();
  const { data, error, mutate } = useSWR<{ tests: TestRow[] }>("/api/tests", staffApi);
  const tests = data?.tests ?? null;
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load tests" : null;

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("60");
  const [createError, setCreateError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!tests) return tests;
    const needle = q.trim().toLowerCase();
    if (!needle) return tests;
    return tests.filter((t) => t.title.toLowerCase().includes(needle));
  }, [tests, q]);

  async function createTest(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    try {
      const res = await staffApi<{ test: { id: string } }>("/api/tests", {
        method: "POST",
        body: { title, durationMinutes: Number(duration) },
      });
      mutate();
      router.push(`/tests/${res.test.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Could not create test");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-headline-md text-on-surface">Tests</h1>
        <Button onClick={() => setCreating((c) => !c)}>New test</Button>
      </div>

      {creating ? (
        <Card className="p-5">
          <form onSubmit={createTest} className="flex flex-wrap items-end gap-3">
            <Field label="Title" className="min-w-64 flex-1">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="App Dev Intern Screen: July"
                required
              />
            </Field>
            <Field label="Duration (minutes)">
              <Input
                type="number"
                min={5}
                max={480}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-32"
              />
            </Field>
            <Button type="submit">Create draft</Button>
          </form>
          {createError ? <div className="mt-3"><ErrorNote message={createError} /></div> : null}
        </Card>
      ) : null}

      {tests && tests.length > 0 ? (
        <Input
          aria-label="Search tests"
          placeholder="Search tests…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
      ) : null}

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorNote message={loadError} />
          </div>
        ) : !tests ? (
          <Spinner />
        ) : tests.length === 0 ? (
          <EmptyState title="No tests yet" hint="Create a draft, add questions, publish, then invite candidates." />
        ) : filtered && filtered.length === 0 ? (
          <EmptyState title="No tests match your search" hint="Try a different title." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Test</Th>
                <Th>Status</Th>
                <Th>Duration</Th>
                <Th>Questions</Th>
                <Th>Invited</Th>
                <Th>In progress</Th>
                <Th>Completed</Th>
                <Th>Updated</Th>
              </tr>
            </Thead>
            <Tbody>
              {filtered!.map((t) => (
                <Tr key={t.id}>
                  <Td className="pl-5">
                    <Link href={`/tests/${t.id}`} className="font-medium text-accent hover:underline">
                      {t.title}
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td>{t.durationMinutes} min</Td>
                  <Td>{t.counts.questions}</Td>
                  <Td>{t.counts.invited}</Td>
                  <Td>{t.counts.inProgress}</Td>
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
