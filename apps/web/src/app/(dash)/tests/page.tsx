"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { staffApi, ApiError } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Spinner,
  statusBadgeColor,
} from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { fmtDateTime, titleCase } from "@/lib/format";

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
  const [tests, setTests] = useState<TestRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("60");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    staffApi<{ tests: TestRow[] }>("/api/tests").then((d) => setTests(d.tests));
  }, []);

  async function createTest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await staffApi<{ test: { id: string } }>("/api/tests", {
        method: "POST",
        body: { title, durationMinutes: Number(duration) },
      });
      router.push(`/tests/${res.test.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create test");
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
          {error ? <div className="mt-3"><ErrorNote message={error} /></div> : null}
        </Card>
      ) : null}

      <Card>
        {!tests ? (
          <Spinner />
        ) : tests.length === 0 ? (
          <EmptyState title="No tests yet" hint="Create a draft, add questions, publish, then invite candidates." />
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
              {tests.map((t) => (
                <Tr key={t.id}>
                  <Td className="pl-5">
                    <Link href={`/tests/${t.id}`} className="font-medium text-accent hover:underline">
                      {t.title}
                    </Link>
                  </Td>
                  <Td>
                    <Badge color={statusBadgeColor(t.status)}>{titleCase(t.status)}</Badge>
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
