"use client";

import { useState } from "react";
import useSWR from "swr";
import { staffApi, ApiError } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { Modal } from "@/components/Modal";
import { fmtDateTime, titleCase } from "@/lib/format";

interface TicketRow {
  id: string;
  channel: "org" | "codeforge";
  status: "open" | "pending" | "resolved" | "closed";
  priority: "normal" | "urgent";
  subject: string;
  candidateName: string | null;
  candidateEmail: string | null;
  createdAt: string;
  updatedAt: string;
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
  const { data, error, mutate } = useSWR<{ tickets: TicketRow[] }>(
    `/api/support?${status ? `status=${status}` : ""}`,
    staffApi
  );
  const tickets = data?.tickets ?? null;
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load support tickets" : null;

  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openCodeforgeTicket() {
    setBusy(true);
    setComposeError(null);
    try {
      await staffApi("/api/support", { method: "POST", body: { subject: newSubject, body: newBody } });
      setComposing(false);
      setNewSubject("");
      setNewBody("");
      await mutate();
    } catch (err) {
      setComposeError(err instanceof ApiError ? err.message : "Could not open the ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-headline-md text-on-surface">Support</h1>
        <Button onClick={() => setComposing(true)}>Contact CodeForge</Button>
      </div>

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
          <EmptyState
            title="No support tickets"
            hint="Candidate questions and technical issues will show up here."
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Subject</Th>
                <Th>From</Th>
                <Th>Channel</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </tr>
            </Thead>
            <Tbody>
              {tickets.map((t) => (
                <Tr key={t.id} className="cursor-pointer" onClick={() => setOpenId(t.id)}>
                  <Td className="pl-5 font-medium text-on-surface">{t.subject}</Td>
                  <Td>{t.candidateName ?? "Staff"}</Td>
                  <Td>{t.channel === "org" ? "This org" : "CodeForge"}</Td>
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

      <Modal open={composing} onClose={() => setComposing(false)} title="Contact CodeForge">
        <div className="space-y-4">
          {composeError ? <ErrorNote message={composeError} /> : null}
          <Field label="Subject">
            <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Message">
            <Textarea rows={4} value={newBody} onChange={(e) => setNewBody(e.target.value)} maxLength={5000} />
          </Field>
          <Button className="w-full" disabled={busy || !newSubject.trim() || !newBody.trim()} onClick={openCodeforgeTicket}>
            {busy ? "Sending…" : "Send to CodeForge"}
          </Button>
        </div>
      </Modal>

      {openId ? <TicketDetailModal id={openId} onClose={() => setOpenId(null)} onChanged={mutate} /> : null}
    </div>
  );
}

function TicketDetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, mutate } = useSWR<{ ticket: TicketDetail }>(`/api/support/${id}`, staffApi);
  const ticket = data?.ticket;
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendReply() {
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await staffApi(`/api/support/${id}/messages`, { method: "POST", body: { body: reply.trim() } });
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
    await staffApi(`/api/support/${id}`, { method: "PUT", body: { status } });
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
              {ticket.candidateName ?? "Staff"}
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
