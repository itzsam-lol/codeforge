"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { hqApi, ApiError } from "@/lib/api";
import { Badge, Button, Card, ErrorNote, Select, Spinner, Textarea } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

function IconArrowLeft() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

interface Message {
  id: string;
  authorType: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface TicketDetail {
  id: string;
  status: "open" | "pending" | "resolved" | "closed";
  priority: "normal" | "urgent";
  subject: string;
  candidateName: string | null;
  candidateEmail: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; companyName: string };
  messages: Message[];
}

const STATUS_COLOR: Record<TicketDetail["status"], "info" | "warn" | "ok" | "neutral"> = {
  open: "info",
  pending: "warn",
  resolved: "ok",
  closed: "neutral",
};

const AUTHOR_STYLE: Record<string, string> = {
  candidate: "bg-surface-container",
  staff: "bg-accent/10",
  codeforge: "bg-accent/10",
};

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, mutate } = useSWR<{ ticket: TicketDetail }>(`/api/support-tickets/${params.id}`, hqApi);
  const ticket = data?.ticket;

  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  async function sendReply() {
    if (!reply.trim() || !ticket) return;
    setBusy(true);
    setError(null);
    try {
      await hqApi(`/api/support-tickets/${ticket.id}/messages`, { method: "POST", body: { body: reply.trim() } });
      setReply("");
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the reply");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    if (!ticket) return;
    setStatusBusy(true);
    setError(null);
    try {
      await hqApi(`/api/support-tickets/${ticket.id}`, { method: "PUT", body: { status } });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the ticket status");
    } finally {
      setStatusBusy(false);
    }
  }

  if (!ticket) return <Spinner label="Loading ticket…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/support"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface"
      >
        <IconArrowLeft />
        Support
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-headline-md text-on-surface">{ticket.subject}</h1>
            <Badge color={STATUS_COLOR[ticket.status]}>{titleCase(ticket.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-on-surface-variant">
            {ticket.client.companyName} · {ticket.candidateName ?? "Staff"}
            {ticket.candidateEmail ? ` · ${ticket.candidateEmail}` : ""} · opened {fmtDateTime(ticket.createdAt)}
          </p>
        </div>
        <Select
          aria-label="Ticket status"
          value={ticket.status}
          onChange={(e) => void setStatus(e.target.value)}
          disabled={statusBusy}
          className="w-36 shrink-0"
        >
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </Select>
      </div>

      <Card className="space-y-3 p-5">
        {ticket.messages.map((m) => (
          <div key={m.id} className={`rounded-control p-4 ${AUTHOR_STYLE[m.authorType] ?? "bg-surface-container"}`}>
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <span className="font-medium text-on-surface">{m.authorName}</span>
              <span>{fmtDateTime(m.createdAt)}</span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-on-surface">{m.body}</p>
          </div>
        ))}
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-semibold text-on-surface">Reply</h3>
        {error ? <ErrorNote message={error} /> : null}
        <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
        <div className="flex justify-end">
          <Button disabled={busy || !reply.trim()} onClick={sendReply}>
            {busy ? "Sending…" : "Reply"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
