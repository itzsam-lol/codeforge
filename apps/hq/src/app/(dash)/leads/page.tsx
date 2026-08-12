"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { hqApi, hqApiDownload, ApiError } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Select, Spinner } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { fmtDateTime, titleCase } from "@/lib/format";

interface LeadRow {
  id: string;
  name: string;
  email: string;
  company: string;
  teamSize: string | null;
  focus: string | null;
  message: string | null;
  intent: "demo" | "sales";
  status: "new" | "contacted" | "qualified" | "converted" | "dismissed";
  createdAt: string;
}

const STATUSES = ["new", "contacted", "qualified", "converted", "dismissed"] as const;

export default function LeadsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const BULK_STATUSES = ["contacted", "qualified", "dismissed"] as const;

  const queryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    return `/api/leads?${params}`;
  }, [status]);

  const { data, error: loadErrorObj, mutate } = useSWR<{ leads: LeadRow[] }>(queryKey, hqApi);
  const leads = data?.leads ?? null;
  const loadError = loadErrorObj instanceof ApiError ? loadErrorObj.message : loadErrorObj ? "Could not load leads" : null;

  const filtered = useMemo(() => {
    if (!leads) return leads;
    const needle = q.trim().toLowerCase();
    if (!needle) return leads;
    return leads.filter(
      (l) => l.company.toLowerCase().includes(needle) || l.name.toLowerCase().includes(needle)
    );
  }, [leads, q]);

  async function setStatusFor(id: string, next: string) {
    setError(null);
    try {
      await hqApi(`/api/leads/${id}`, { method: "PUT", body: { status: next } });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the lead");
    }
  }

  const allSelected = Boolean(filtered && filtered.length > 0 && selected.size === filtered.length);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set((filtered ?? []).map((l) => l.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkSetStatus(newStatus: (typeof BULK_STATUSES)[number]) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setBulkNotice(null);
    try {
      const res = await hqApi<{ updated: number; skipped: number }>("/api/leads/bulk", {
        method: "POST",
        body: { leadIds: [...selected], status: newStatus },
      });
      setBulkNotice(`${res.updated} lead${res.updated === 1 ? "" : "s"} set to ${newStatus}`);
      setSelected(new Set());
      await mutate();
    } catch (err) {
      setBulkNotice(err instanceof ApiError ? err.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function convert(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const d = await hqApi<{ client: { id: string } }>(`/api/leads/${id}/convert`, { method: "POST" });
      router.push(`/clients/${d.client.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not convert this lead");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-md text-on-surface">Leads</h1>
          <p className="text-sm text-on-surface-variant">Submissions from the marketing site's Book a demo / Contact sales form.</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => hqApiDownload("/api/leads/export.csv", "leads.csv")}
        >
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Search leads"
          placeholder="Search name or company…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
      </div>

      {error ? <ErrorNote message={error} /> : null}

      {selected.size > 0 ? (
        <Card className="flex flex-wrap items-center gap-2 p-3 text-xs">
          <span className="font-medium text-on-surface-variant">{selected.size} selected</span>
          {BULK_STATUSES.map((s) => (
            <Button key={s} size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulkSetStatus(s)}>
              Set {titleCase(s)}
            </Button>
          ))}
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
        ) : !leads ? (
          <Spinner />
        ) : leads.length === 0 ? (
          <EmptyState title="No leads yet" hint="They'll appear here as visitors submit the marketing site's contact form." />
        ) : filtered && filtered.length === 0 ? (
          <EmptyState title="No leads match your search" hint="Try a different name or company." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">
                  <input type="checkbox" aria-label="Select all leads" checked={allSelected} onChange={toggleAll} />
                </Th>
                <Th>Name</Th>
                <Th>Company</Th>
                <Th>Intent</Th>
                <Th>Status</Th>
                <Th>Received</Th>
                <Th className="pr-5" />
              </tr>
            </Thead>
            <Tbody>
              {filtered!.map((l) => (
                <Tr key={l.id}>
                  <Td className="pl-5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${l.name}`}
                      checked={selected.has(l.id)}
                      onChange={() => toggleOne(l.id)}
                    />
                  </Td>
                  <Td>
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-on-surface-variant">{l.email}</div>
                  </Td>
                  <Td>{l.company}</Td>
                  <Td>
                    <Badge color={l.intent === "demo" ? "accent" : "info"}>{l.intent === "demo" ? "Demo" : "Sales"}</Badge>
                  </Td>
                  <Td>
                    <Select
                      aria-label="Lead status"
                      value={l.status}
                      disabled={l.status === "converted"}
                      onChange={(e) => void setStatusFor(l.id, e.target.value)}
                      className="w-36"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {titleCase(s)}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td className="text-on-surface-variant">{fmtDateTime(l.createdAt)}</Td>
                  <Td className="pr-5 text-right">
                    {l.status !== "converted" ? (
                      <button
                        disabled={busyId === l.id}
                        onClick={() => void convert(l.id)}
                        className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                      >
                        {busyId === l.id ? "Converting…" : "Convert to client"}
                      </button>
                    ) : (
                      <span className="text-xs text-on-surface-variant">Converted</span>
                    )}
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
