"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { hqApi, ApiError } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorNote, Select, Spinner } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { fmtDateTime, titleCase } from "@/lib/format";

interface TicketRow {
  id: string;
  status: "open" | "pending" | "resolved" | "closed";
  priority: "normal" | "urgent";
  subject: string;
  candidateName: string | null;
  candidateEmail: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; companyName: string };
  _count: { messages: number };
}

const STATUS_COLOR: Record<TicketRow["status"], "info" | "warn" | "ok" | "neutral"> = {
  open: "info",
  pending: "warn",
  resolved: "ok",
  closed: "neutral",
};

export default function SupportPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const queryKey = useMemo(() => `/api/support-tickets?${status ? `status=${status}` : ""}`, [status]);
  const { data, error } = useSWR<{ tickets: TicketRow[] }>(queryKey, hqApi);
  const tickets = data?.tickets ?? null;
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load support tickets" : null;

  return (
    <div className="space-y-5">
      <h1 className="text-headline-md text-on-surface">Support</h1>
      <p className="text-sm text-on-surface-variant">Technical issues reported by clients and their candidates.</p>

      <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="pending">Pending</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </Select>

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorNote message={loadError} />
          </div>
        ) : !tickets ? (
          <Spinner />
        ) : tickets.length === 0 ? (
          <EmptyState title="No support tickets" hint="Client-reported technical issues will show up here." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Subject</Th>
                <Th>Client</Th>
                <Th>From</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </tr>
            </Thead>
            <Tbody>
              {tickets.map((t) => (
                <Tr key={t.id} className="cursor-pointer" onClick={() => router.push(`/support/${t.id}`)}>
                  <Td className="pl-5 font-medium text-on-surface">{t.subject}</Td>
                  <Td>{t.client.companyName}</Td>
                  <Td>{t.candidateName ?? "Staff"}</Td>
                  <Td>
                    <Badge color={STATUS_COLOR[t.status]}>{titleCase(t.status)}</Badge>
                  </Td>
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
