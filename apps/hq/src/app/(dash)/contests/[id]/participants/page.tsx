"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { hqApi, ApiError } from "@/lib/api";
import { Button, Card, EmptyState, ErrorNote, Input, Select, Spinner, StatusBadge } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { ConfirmDialog } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { fmtDateTime } from "@/lib/format";

interface Participant {
  userId: string;
  handle: string;
  name: string;
  rating: number;
  status: string;
  score: number;
  rank: number | null;
  chosenProctoringLevel: string;
  strikeCount: number;
  registeredAt: string;
}

const STATUS_OPTIONS = ["registered", "active", "submitted", "warned", "disqualified"] as const;

export default function ContestParticipantsPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ userId: string; action: "disqualify" | "reinstate" } | null>(null);

  const qs = new URLSearchParams();
  if (search.trim()) qs.set("search", search.trim());
  if (status) qs.set("status", status);
  const { data, error, mutate } = useSWR<{ participants: Participant[] }>(
    `/api/contests/${id}/participants?${qs.toString()}`,
    hqApi
  );
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load participants" : null;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of data?.participants ?? []) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [data]);

  async function applyAction(userId: string, action: "disqualify" | "reinstate") {
    setBusyUserId(userId);
    try {
      await hqApi(`/api/contests/${id}/participants/${userId}/status`, { method: "POST", body: { action } });
      toast.toast(action === "disqualify" ? "Participant disqualified" : "Participant reinstated");
      mutate();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not update participant", "error");
    } finally {
      setBusyUserId(null);
      setConfirming(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-headline-md text-on-surface">Participants</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {Object.entries(counts)
            .map(([s, n]) => `${n} ${s}`)
            .join(" · ") || "No registrants yet"}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="Search participants"
          placeholder="Search by handle or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-40">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorNote message={loadError} />
          </div>
        ) : !data ? (
          <Spinner />
        ) : data.participants.length === 0 ? (
          <EmptyState title="No participants found" hint="Nobody matches this search/filter yet." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Participant</Th>
                <Th>Status</Th>
                <Th>Score</Th>
                <Th>Rank</Th>
                <Th>Proctoring</Th>
                <Th>Strikes</Th>
                <Th>Registered</Th>
                <Th className="pr-5">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {data.participants.map((p) => (
                <Tr key={p.userId}>
                  <Td className="pl-5">
                    <span className="font-medium text-on-surface">{p.name}</span>{" "}
                    <span className="text-xs text-on-surface-variant">@{p.handle}</span>
                  </Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td>{p.score}</Td>
                  <Td>{p.rank ?? "—"}</Td>
                  <Td className="capitalize text-on-surface-variant">{p.chosenProctoringLevel}</Td>
                  <Td>{p.strikeCount}</Td>
                  <Td className="text-on-surface-variant">{fmtDateTime(p.registeredAt)}</Td>
                  <Td className="pr-5">
                    {p.status === "disqualified" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyUserId === p.userId}
                        onClick={() => setConfirming({ userId: p.userId, action: "reinstate" })}
                      >
                        Reinstate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyUserId === p.userId}
                        onClick={() => setConfirming({ userId: p.userId, action: "disqualify" })}
                      >
                        Disqualify
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.action === "disqualify" ? "Disqualify this participant?" : "Reinstate this participant?"}
        body={
          confirming?.action === "disqualify"
            ? "They'll be removed from standings and can no longer submit. This doesn't touch their rating — use AI Review's \"Confirm cheating\" for that."
            : "Their status returns to active and their strike count resets to zero."
        }
        confirmLabel={confirming?.action === "disqualify" ? "Disqualify" : "Reinstate"}
        danger={confirming?.action === "disqualify"}
        busy={busyUserId === confirming?.userId}
        onConfirm={() => confirming && applyAction(confirming.userId, confirming.action)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
