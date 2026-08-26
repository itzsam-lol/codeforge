"use client";

import { useMemo, useState, type FormEvent } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hqApi, ApiError } from "@/lib/api";
import { Button, Card, EmptyState, ErrorNote, Field, Input, Spinner, StatusBadge } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { fmtDateTime } from "@/lib/format";

interface ContestRow {
  id: string;
  title: string;
  status: string;
  startAt: string;
  endAt: string;
  _count: { questions: number };
}

export default function ContestsPage() {
  const router = useRouter();
  const { data, error, mutate } = useSWR<{ contests: ContestRow[] }>("/api/contests", hqApi);
  const contests = data?.contests ?? null;
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load contests" : null;

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!contests) return contests;
    const needle = q.trim().toLowerCase();
    if (!needle) return contests;
    return contests.filter((c) => c.title.toLowerCase().includes(needle));
  }, [contests, q]);

  async function createContest(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!startAt || !endAt) {
      setCreateError("Pick a start and end time");
      return;
    }
    setSubmitting(true);
    try {
      const res = await hqApi<{ contest: { id: string } }>("/api/contests", {
        method: "POST",
        body: {
          title,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
        },
      });
      mutate();
      router.push(`/contests/${res.contest.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Could not create contest");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-headline-md text-on-surface">Arena Contests</h1>
        <Button onClick={() => setCreating((c) => !c)}>New contest</Button>
      </div>

      {creating ? (
        <Card className="p-5">
          <form onSubmit={createContest} className="flex flex-wrap items-end gap-3">
            <Field label="Title" className="min-w-64 flex-1">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Weekly Contest #12"
                required
              />
            </Field>
            <Field label="Start">
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
            </Field>
            <Field label="End">
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create draft"}
            </Button>
          </form>
          {createError ? <div className="mt-3"><ErrorNote message={createError} /></div> : null}
        </Card>
      ) : null}

      {contests && contests.length > 0 ? (
        <Input
          aria-label="Search contests"
          placeholder="Search contests…"
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
        ) : !contests ? (
          <Spinner />
        ) : contests.length === 0 ? (
          <EmptyState title="No contests yet" hint="Create a draft, add questions, then publish it." />
        ) : filtered && filtered.length === 0 ? (
          <EmptyState title="No contests match your search" hint="Try a different title." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Contest</Th>
                <Th>Status</Th>
                <Th>Questions</Th>
                <Th>Starts</Th>
                <Th>Ends</Th>
              </tr>
            </Thead>
            <Tbody>
              {filtered!.map((c) => (
                <Tr key={c.id}>
                  <Td className="pl-5">
                    <Link href={`/contests/${c.id}`} className="font-medium text-accent hover:underline">
                      {c.title}
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td>{c._count.questions}</Td>
                  <Td className="text-on-surface-variant">{fmtDateTime(c.startAt)}</Td>
                  <Td className="text-on-surface-variant">{fmtDateTime(c.endAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
