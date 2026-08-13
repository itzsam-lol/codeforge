"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { staffApi, staffApiDownload, ApiError } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Spinner, StatusBadge } from "../ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { ConfirmDialog } from "@/components/Modal";
import { IconFlag } from "@/components/icons";
import { fmtDateTime, fmtScore, integrityScoreColor } from "@/lib/format";

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
  shortlisted: boolean;
  tags: string[];
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ sessionId: string; candidateName: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const load = useCallback(() => {
    staffApi<ResultsPayload>(`/api/tests/${testId}/results`)
      .then(setData)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load results"));
  }, [testId]);

  useEffect(load, [load]);

  if (loadError) return <ErrorNote message={loadError} />;
  if (!data) return <Spinner />;

  const cards = [
    { label: "Invited", value: data.summary.invited },
    { label: "Started", value: data.summary.started },
    { label: "Completed", value: data.summary.completed },
    { label: "Average score", value: data.summary.averageScore ?? "-" },
  ];

  const allSelected = data.sessions.length > 0 && selected.size === data.sessions.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(data!.sessions.map((s) => s.sessionId)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulk(action: "shortlist" | "unshortlist" | "addTag" | "removeTag", tag?: string) {
    if (selected.size === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      await staffApi(`/api/tests/${testId}/sessions/bulk`, {
        method: "POST",
        body: { sessionIds: [...selected], action, tag },
      });
      setTagInput("");
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update the selected candidates");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteCandidate() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      await staffApi(`/api/tests/${testId}/sessions/${deleteTarget.sessionId}`, { method: "DELETE" });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.sessionId);
        return next;
      });
      setDeleteTarget(null);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not delete this candidate");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmDeleteSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      // Each deletion does its own per-session media cleanup server-side, so
      // this fires all of them concurrently rather than one round trip at a
      // time — N requests either way, but no longer serialized.
      await Promise.all(
        [...selected].map((sessionId) =>
          staffApi(`/api/tests/${testId}/sessions/${sessionId}`, { method: "DELETE" })
        )
      );
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not delete the selected candidates");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this candidate?"
        body={
          <>
            Permanently delete {deleteTarget?.candidateName}? This removes their invitation,
            submissions, scores, and proctoring data for this test. This cannot be undone.
            {actionError ? <div className="mt-2"><ErrorNote message={actionError} /></div> : null}
          </>
        }
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteTarget(null);
          setActionError(null);
        }}
        onConfirm={confirmDeleteCandidate}
      />
      <ConfirmDialog
        open={bulkDeleteConfirm}
        title={`Delete ${selected.size} candidate${selected.size === 1 ? "" : "s"}?`}
        body={
          <>
            Permanently delete{" "}
            {data.sessions
              .filter((s) => selected.has(s.sessionId))
              .map((s) => s.candidateName)
              .join(", ")}
            ? This removes their invitations, submissions, scores, and proctoring data for this
            test. This cannot be undone.
            {actionError ? <div className="mt-2"><ErrorNote message={actionError} /></div> : null}
          </>
        }
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => {
          if (busy) return;
          setBulkDeleteConfirm(false);
          setActionError(null);
        }}
        onConfirm={confirmDeleteSelected}
      />
      {actionError && deleteTarget === null && !bulkDeleteConfirm ? <ErrorNote message={actionError} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.label} className="p-4">
              <div className="text-2xl font-semibold">{c.value}</div>
              <div className="mt-1 text-xs text-on-surface-variant">{c.label}</div>
            </Card>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => staffApiDownload(`/api/tests/${testId}/results/export.csv`, "results.csv")}
          >
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => staffApiDownload(`/api/tests/${testId}/results/export.pdf`, "results.pdf")}
          >
            Export PDF
          </Button>
          <Button size="sm" variant="secondary" onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      {selected.size > 0 ? (
        <Card className="flex flex-wrap items-center gap-2 p-3 text-xs">
          <span className="font-medium text-on-surface-variant">{selected.size} selected</span>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulk("shortlist")}>
            Shortlist
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => bulk("unshortlist")}>
            Unshortlist
          </Button>
          <div className="flex items-center gap-1">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="tag name"
              className="h-7 w-28 py-1 text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !tagInput.trim()}
              onClick={() => bulk("addTag", tagInput.trim())}
            >
              Add tag
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => setBulkDeleteConfirm(true)}
            className="ml-auto"
          >
            Delete selected
          </Button>
        </Card>
      ) : null}

      <Card>
        {data.sessions.length === 0 ? (
          <EmptyState title="No sessions yet" hint="Results appear as soon as candidates open their links." />
        ) : (
          <Table className="min-w-[760px]">
            <Thead>
              <tr>
                <Th className="pl-5">
                  <input
                    type="checkbox"
                    aria-label="Select all candidates"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </Th>
                <Th>Candidate</Th>
                <Th>Status</Th>
                <Th>Score</Th>
                <Th title="Integrity signal, for human review, never an automatic verdict">Integrity</Th>
                <Th>Similarity</Th>
                <Th>Time taken</Th>
                <Th>Submitted</Th>
                <Th className="pr-5" />
              </tr>
            </Thead>
            <Tbody>
              {data.sessions.map((s) => (
                <Tr key={s.sessionId}>
                  <Td className="pl-5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${s.candidateName}`}
                      checked={selected.has(s.sessionId)}
                      onChange={() => toggleOne(s.sessionId)}
                    />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {s.shortlisted ? <IconFlag size={12} filled className="text-warn" /> : null}
                      <div>
                        <div className="font-medium">{s.candidateName}</div>
                        <div className="text-xs text-on-surface-variant">{s.candidateEmail}</div>
                      </div>
                    </div>
                    {s.tags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.tags.map((t) => (
                          <Badge key={t} color="accent">{t}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <StatusBadge status={s.status} />
                  </Td>
                  <Td>
                    <span className="font-semibold">{fmtScore(s.totalScore, s.maxScore)}</span>
                    {s.gradingPending ? (
                      <Badge color="warn">grading…</Badge>
                    ) : null}
                  </Td>
                  <Td>
                    {s.integrityScore != null ? (
                      <div
                        className="flex items-center gap-2"
                        aria-label={`Integrity score ${s.integrityScore} out of 100`}
                      >
                        <span
                          className="h-1.5 w-8 rounded-full opacity-80"
                          style={{ backgroundColor: integrityScoreColor(s.integrityScore) }}
                        />
                        <span className="font-mono text-sm" style={{ color: integrityScoreColor(s.integrityScore) }}>
                          {s.integrityScore}
                        </span>
                      </div>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td>
                    {s.plagiarismMaxPct != null ? (
                      <Badge color={s.plagiarismMaxPct >= 70 ? "bad" : s.plagiarismMaxPct >= 40 ? "warn" : "neutral"}>
                        {s.plagiarismMaxPct}%
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td>{s.timeTakenMinutes != null ? `${s.timeTakenMinutes} min` : "-"}</Td>
                  <Td className="text-on-surface-variant">{fmtDateTime(s.submittedAt)}</Td>
                  <Td className="pr-5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/sessions/${s.sessionId}`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Review →
                      </Link>
                      <button
                        onClick={() => setDeleteTarget({ sessionId: s.sessionId, candidateName: s.candidateName })}
                        className="text-xs font-medium text-bad hover:underline"
                      >
                        Delete
                      </button>
                    </div>
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
