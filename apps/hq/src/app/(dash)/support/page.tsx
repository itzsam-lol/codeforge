"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { hqApi, ApiError } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorNote, Select, Spinner, Textarea, Button } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { Modal } from "@/components/Modal";
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

interface Message {
  id: string;
  authorType: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface TicketDetail extends TicketRow {
  messages: Message[];
}

const STATUS_COLOR: Record<TicketRow["status"], "info" | "warn" | "ok" | "neutral"> = {
  open: "info",
  pending: "warn",
  resolved: "ok",
  closed: "neutral",
};

export default function SupportPage() {
  const [status, setStatus] = useState("");
  const queryKey = useMemo(() => `/api/support-tickets?${status ? `status=${status}` : ""}`, [status]);
  const { data, error, mutate } = useSWR<{ tickets: TicketRow[] }>(queryKey, hqApi);
  const tickets = data?.tickets ?? null;
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load support tickets" : null;

  const [openId, setOpenId] = useState<string | null>(null);

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
                <Tr key={t.id} className="cursor-pointer" onClick={() => setOpenId(t.id)}>
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

      {openId ? <TicketDetailModal id={openId} onClose={() => setOpenId(null)} onChanged={mutate} /> : null}
    </div>
  );
}

function TicketDetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, mutate } = useSWR<{ ticket: TicketDetail }>(`/api/support-tickets/${id}`, hqApi);
  const ticket = data?.ticket;
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendReply() {
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await hqApi(`/api/support-tickets/${id}/messages`, { method: "POST", body: { body: reply.trim() } });
      setReply("");
      await mutate();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the reply");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    await hqApi(`/api/support-tickets/${id}`, { method: "PUT", body: { status } });
    await mutate();
    onChanged();
  }

  return (
    <Modal open onClose={onClose} title={ticket?.subject ?? "Ticket"}>
      {!ticket ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span>
              {ticket.client.companyName} · {ticket.candidateName ?? "Staff"}
              {ticket.candidateEmail ? ` · ${ticket.candidateEmail}` : ""}
            </span>
            <Select
              aria-label="Ticket status"
              value={ticket.status}
              onChange={(e) => void setStatus(e.target.value)}
              className="w-32"
            >
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </Select>
          </div>

          <div className="max-h-72 space-y-3 overflow-y-auto">
            {ticket.messages.map((m) => (
              <div key={m.id} className="rounded-control bg-surface-container p-3">
                <div className="flex items-center justify-between text-xs text-on-surface-variant">
                  <span className="font-medium text-on-surface">{m.authorName}</span>
                  <span>{fmtDateTime(m.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-on-surface">{m.body}</p>
              </div>
            ))}
          </div>

          {error ? <ErrorNote message={error} /> : null}
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply…"
              className="flex-1"
            />
            <Button disabled={busy || !reply.trim()} onClick={sendReply}>
              {busy ? "Sending…" : "Reply"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
