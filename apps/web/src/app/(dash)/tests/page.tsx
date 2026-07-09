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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tests</h1>
        <Button onClick={() => setCreating((c) => !c)}>New test</Button>
      </div>

      {creating ? (
        <Card className="p-5">
          <form onSubmit={createTest} className="flex flex-wrap items-end gap-3">
            <Field label="Title" className="min-w-64 flex-1">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="App Dev Intern Screen — July"
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2 font-medium">Test</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Questions</th>
                <th className="px-3 py-2 font-medium">Invited</th>
                <th className="px-3 py-2 font-medium">In progress</th>
                <th className="px-3 py-2 font-medium">Completed</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-2.5">
                    <Link href={`/tests/${t.id}`} className="font-medium text-indigo-700 hover:underline">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={statusBadgeColor(t.status)}>{titleCase(t.status)}</Badge>
                  </td>
                  <td className="px-3 py-2.5">{t.durationMinutes} min</td>
                  <td className="px-3 py-2.5">{t.counts.questions}</td>
                  <td className="px-3 py-2.5">{t.counts.invited}</td>
                  <td className="px-3 py-2.5">{t.counts.inProgress}</td>
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
