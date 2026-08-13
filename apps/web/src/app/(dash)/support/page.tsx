"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { staffApi, ApiError } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
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

const STATUS_COLOR: Record<TicketRow["status"], "info" | "warn" | "ok" | "neutral"> = {
  open: "info",
  pending: "warn",
  resolved: "ok",
  closed: "neutral",
};

export default function SupportPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const { data, error, mutate } = useSWR<{ tickets: TicketRow[] }>(
    `/api/support?${status ? `status=${status}` : ""}`,
    staffApi
  );
  const tickets = data?.tickets ?? null;
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load support tickets" : null;

  const [composing, setComposing] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openCodeforgeTicket() {
    setBusy(true);
    setComposeError(null);
    try {
      const res = await staffApi<{ ticket: { id: string } }>("/api/support", {
        method: "POST",
        body: { subject: newSubject, body: newBody },
      });
      setComposing(false);
      setNewSubject("");
      setNewBody("");
      await mutate();
      router.push(`/support/${res.ticket.id}`);
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
                <Tr key={t.id} className="cursor-pointer" onClick={() => router.push(`/support/${t.id}`)}>
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
    </div>
  );
}
