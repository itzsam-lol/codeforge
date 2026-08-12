"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { hqApi, ApiError } from "@/lib/api";
import { Button, Card, EmptyState, ErrorNote, Select, Spinner, StatusBadge, cn } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { Modal } from "@/components/Modal";
import { Field, Input, Textarea } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

interface ClientRow {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  status: "lead" | "trial" | "live" | "churned";
  updatedAt: string;
  provisioningTarget: { id: string } | null;
  latestHealthCheck: { healthy: boolean; checkedAt: string } | null;
}

function HealthPill({ check }: { check: ClientRow["latestHealthCheck"] }) {
  if (!check) return <span className="text-xs text-on-surface-variant">Not monitored</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", check.healthy ? "text-ok" : "text-bad")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", check.healthy ? "bg-ok" : "bg-bad")} />
      {check.healthy ? "Healthy" : "Unreachable"}
    </span>
  );
}

const STATUSES = ["lead", "trial", "live", "churned"] as const;

export default function ClientsPage() {
  const [status, setStatus] = useState("");
  const [renewingSoon, setRenewingSoon] = useState(false);
  const [q, setQ] = useState("");

  const queryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (renewingSoon) params.set("renewingSoon", "true");
    return `/api/clients?${params}`;
  }, [status, renewingSoon]);

  const { data, error, mutate } = useSWR<{ clients: ClientRow[] }>(queryKey, hqApi);
  const clients = data?.clients ?? null;
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load clients" : null;

  const filtered = useMemo(() => {
    if (!clients) return clients;
    const needle = q.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter(
      (c) => c.companyName.toLowerCase().includes(needle) || c.contactName.toLowerCase().includes(needle)
    );
  }, [clients, q]);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ companyName: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" });
  const [error2, setError2] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitCreate() {
    setBusy(true);
    setError2(null);
    try {
      await hqApi("/api/clients", { method: "POST", body: form });
      setCreating(false);
      setForm({ companyName: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" });
      await mutate();
    } catch (err) {
      setError2(err instanceof ApiError ? err.message : "Could not create the client");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-headline-md text-on-surface">Clients</h1>
        <Button onClick={() => setCreating(true)}>Add client</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Search clients"
          placeholder="Search company or contact…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          <input
            type="checkbox"
            checked={renewingSoon}
            onChange={(e) => setRenewingSoon(e.target.checked)}
            className="accent-accent"
          />
          Renewing within 30 days
        </label>
      </div>

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorNote message={loadError} />
          </div>
        ) : !clients ? (
          <Spinner />
        ) : clients.length === 0 ? (
          <EmptyState title="No clients yet" hint="Add one, or convert a lead from the Leads inbox." />
        ) : filtered && filtered.length === 0 ? (
          <EmptyState title="No clients match your search" hint="Try a different name." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Company</Th>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th>Provisioning</Th>
                <Th>Health</Th>
                <Th>Updated</Th>
              </tr>
            </Thead>
            <Tbody>
              {filtered!.map((c) => (
                <Tr key={c.id}>
                  <Td className="pl-5">
                    <Link href={`/clients/${c.id}`} className="font-medium text-accent hover:underline">
                      {c.companyName}
                    </Link>
                  </Td>
                  <Td>
                    <div>{c.contactName}</div>
                    <div className="text-xs text-on-surface-variant">{c.contactEmail}</div>
                  </Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td className="text-xs text-on-surface-variant">{c.provisioningTarget ? "Configured" : "Not set up"}</Td>
                  <Td>
                    <HealthPill check={c.latestHealthCheck} />
                  </Td>
                  <Td className="text-on-surface-variant">{fmtDateTime(c.updatedAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="Add client">
        <div className="space-y-4">
          {error2 ? <ErrorNote message={error2} /> : null}
          <Field label="Company name">
            <Input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
          </Field>
          <Field label="Contact name">
            <Input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
          </Field>
          <Field label="Contact email">
            <Input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} />
          </Field>
          <Field label="Contact phone" hint="Optional">
            <Input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
          </Field>
          <Field label="Notes" hint="Optional">
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <Button className="w-full" disabled={busy} onClick={() => void submitCreate()}>
            {busy ? "Creating…" : "Create client"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
