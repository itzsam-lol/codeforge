"use client";

import { useMemo, useState, type FormEvent } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { staffApi, staffApiDownload, ApiError } from "@/lib/api";
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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!tests) return tests;
    const needle = q.trim().toLowerCase();
    if (!needle) return tests;
    return tests.filter((t) => t.title.toLowerCase().includes(needle));
  }, [tests, q]);

  const allSelected = Boolean(filtered && filtered.length > 0 && selected.size === filtered.length);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set((filtered ?? []).map((t) => t.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulk(action: "publish" | "archive") {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setBulkNotice(null);
    try {
      const res = await staffApi<{ updated: number; skipped: number }>("/api/tests/bulk", {
        method: "POST",
        body: { testIds: [...selected], action },
      });
      setBulkNotice(
        `${res.updated} test${res.updated === 1 ? "" : "s"} ${action === "publish" ? "published" : "archived"}` +
          (res.skipped > 0 ? `, ${res.skipped} skipped` : "")
      );
      setSelected(new Set());
      mutate();
    } catch (err) {
      setBulkNotice(err instanceof ApiError ? err.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function duplicate(id: string) {
    setDuplicatingId(id);
    setDuplicateError(null);
    try {
      const res = await staffApi<{ test: { id: string } }>(`/api/tests/${id}/duplicate`, { method: "POST" });
      router.push(`/tests/${res.test.id}`);
    } catch (err) {
      setDuplicateError(err instanceof ApiError ? err.message : "Could not duplicate this test");
      setDuplicatingId(null);
    }
  }

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
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => staffApiDownload("/api/tests/export.csv", "tests.csv")}
          >
            Export CSV
          </Button>
          <Button onClick={() => setCreating((c) => !c)}>New test</Button>
        </div>
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

      {duplicateError ? <ErrorNote message={duplicateError} /> : null}

      {selected.size > 0 ? (
        <Card className="flex flex-wrap items-center gap-2 p-3 text-xs">
          <span className="font-medium text-on-surface-variant">{selected.size} selected</span>
          <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk("publish")}>
            Publish
          </Button>
          <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => bulk("archive")}>
            Archive
          </Button>
          {bulkNotice ? <span className="text-on-surface-variant">{bulkNotice}</span> : null}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">
            Clear selection
          </Button>
        </Card>
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
                <Th className="pl-5">
                  <input type="checkbox" aria-label="Select all tests" checked={allSelected} onChange={toggleAll} />
                </Th>
                <Th>Test</Th>
                <Th>Status</Th>
                <Th>Duration</Th>
                <Th>Questions</Th>
                <Th>Invited</Th>
                <Th>In progress</Th>
                <Th>Completed</Th>
                <Th>Updated</Th>
                <Th />
              </tr>
            </Thead>
            <Tbody>
              {filtered!.map((t) => (
                <Tr key={t.id}>
                  <Td className="pl-5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.title}`}
                      checked={selected.has(t.id)}
                      onChange={() => toggleOne(t.id)}
                    />
                  </Td>
                  <Td>
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
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={duplicatingId === t.id}
                      onClick={() => duplicate(t.id)}
                    >
                      {duplicatingId === t.id ? "Duplicating…" : "Duplicate"}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
