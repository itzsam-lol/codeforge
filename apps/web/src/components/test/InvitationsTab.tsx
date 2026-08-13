"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { staffApi, ApiError } from "@/lib/api";
import type { TestDetail } from "./types";
import { Button, Card, EmptyState, ErrorNote, Spinner, StatusBadge, Textarea } from "../ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { ConfirmDialog } from "@/components/Modal";
import { fmtDateTime, titleCase } from "@/lib/format";

/** Parses a CSV/plain-text upload of "name,email" rows into the bulk textarea. */
function parseCsvToLines(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 0 && /^(name|full ?name)\s*,\s*email$/i.test(lines[0])) {
    lines.shift(); // drop a header row if present
  }
  return lines.join("\n");
}

interface InvitationRow {
  id: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  expiresAt: string;
  // Null once the raw token is no longer available server-side (it's only
  // ever exposed once, at creation/resend time) — the row falls back to a
  // "Resend" action instead of "Copy link".
  link: string | null;
  session: { id: string; status: string; startedAt: string | null; submittedAt: string | null } | null;
}

export function InvitationsTab({ test }: { test: TestDetail }) {
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  // Links are only ever returned once, right here — GET /invitations can't
  // reconstruct them afterward (see InvitationRow.link's comment) — so this
  // holds the freshly created ones just long enough for the recruiter to
  // copy them before the notice is dismissed.
  const [justCreated, setJustCreated] = useState<{ id: string; name: string; link: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setBulk((prev) => [prev.trim(), parseCsvToLines(text)].filter(Boolean).join("\n"));
  }

  const load = useCallback(() => {
    staffApi<{ invitations: InvitationRow[] }>(`/api/tests/${test.id}/invitations`)
      .then((d) => setInvitations(d.invitations))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load invitations"));
  }, [test.id]);

  useEffect(load, [load]);

  async function invite() {
    setBusy(true);
    setError(null);
    setNotice(null);
    // One candidate per line: "Full Name, email@example.com" (CSV-style)
    const candidates = bulk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.lastIndexOf(",");
        if (idx === -1) return { name: line.split("@")[0] ?? line, email: line };
        return { name: line.slice(0, idx).trim(), email: line.slice(idx + 1).trim() };
      });
    if (candidates.length === 0) {
      setError("Enter at least one candidate (one per line: Name, email)");
      setBusy(false);
      return;
    }
    try {
      const res = await staffApi<{
        created: { id: string; email: string; name: string; link: string }[];
        skipped: string[];
      }>(`/api/tests/${test.id}/invitations`, { method: "POST", body: { candidates } });
      setNotice(
        `Invited ${res.created.length} candidate(s)` +
          (res.skipped.length ? `, skipped ${res.skipped.length} already-invited` : "") +
          ". Email delivery uses the console driver in dev — copy links below."
      );
      setJustCreated(res.created.map((c) => ({ id: c.id, name: c.name, link: c.link })));
      setBulk("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    setRevokeError(null);
    try {
      await staffApi(`/api/invitations/${revokeTarget}/revoke`, { method: "POST" });
      setRevokeTarget(null);
      load();
    } catch (err) {
      setRevokeError(err instanceof ApiError ? err.message : "Could not revoke this invitation");
    } finally {
      setRevokeBusy(false);
    }
  }

  async function copyLink(inv: InvitationRow) {
    if (!inv.link) return;
    await navigator.clipboard.writeText(inv.link);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function copyJustCreatedLink(id: string, link: string) {
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function resend(id: string) {
    setResendingId(id);
    setResendError(null);
    try {
      const res = await staffApi<{ link: string }>(`/api/invitations/${id}/resend`, { method: "POST" });
      const inv = invitations?.find((i) => i.id === id);
      setJustCreated((prev) => [
        ...prev.filter((c) => c.id !== id),
        { id, name: inv?.candidateName ?? "Candidate", link: res.link },
      ]);
      load();
    } catch (err) {
      setResendError(err instanceof ApiError ? err.message : "Could not resend this invitation");
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke this invitation link?"
        body={
          <>
            The candidate will no longer be able to open their test link.
            {revokeError ? <div className="mt-2"><ErrorNote message={revokeError} /></div> : null}
          </>
        }
        confirmLabel="Revoke"
        danger
        busy={revokeBusy}
        onCancel={() => {
          if (revokeBusy) return;
          setRevokeTarget(null);
          setRevokeError(null);
        }}
        onConfirm={confirmRevoke}
      />
      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">Invite candidates</h3>
        {test.status !== "published" ? (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
            Publish the test before inviting candidates.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">One per line: Name, email</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={onCsvFile}
                className="hidden"
              />
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                Upload CSV
              </Button>
            </div>
            <Textarea
              rows={4}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={"One per line:\nPriya Sharma, priya@example.com\nRahul Verma, rahul@example.com"}
            />
            {error ? <ErrorNote message={error} /> : null}
            {notice ? (
              <p className="rounded-lg bg-ok-bg px-3 py-2 text-xs text-ok">{notice}</p>
            ) : null}
            {justCreated.length > 0 ? (
              <div className="space-y-1 rounded-lg bg-surface-container p-3">
                {justCreated.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-on-surface-variant">{c.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => copyJustCreatedLink(c.id, c.link)}>
                        {copiedId === c.id ? "Copied!" : "Copy link"}
                      </Button>
                      <button
                        onClick={() => setJustCreated((prev) => prev.filter((x) => x.id !== c.id))}
                        className="text-on-surface-variant hover:text-on-surface"
                        aria-label={`Dismiss link for ${c.name}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={invite} disabled={busy}>
                {busy ? "Inviting…" : "Send invitations"}
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card>
        <div className="px-5 py-3 text-sm font-semibold">
          Invitations {invitations ? `(${invitations.length})` : ""}
        </div>
        {resendError ? (
          <div className="px-5 pb-3">
            <ErrorNote message={resendError} />
          </div>
        ) : null}
        {loadError ? (
          <div className="p-5">
            <ErrorNote message={loadError} />
          </div>
        ) : !invitations ? (
          <Spinner />
        ) : invitations.length === 0 ? (
          <EmptyState title="Nobody invited yet" />
        ) : (
          <Table className="min-w-[600px]">
            <Thead>
              <tr>
                <Th className="pl-5">Candidate</Th>
                <Th>Status</Th>
                <Th>Session</Th>
                <Th>Expires</Th>
                <Th className="pr-5" />
              </tr>
            </Thead>
            <Tbody>
              {invitations.map((inv) => (
                <Tr key={inv.id}>
                  <Td className="pl-5">
                    <div className="font-medium">{inv.candidateName}</div>
                    <div className="text-xs text-on-surface-variant">{inv.candidateEmail}</div>
                  </Td>
                  <Td>
                    <StatusBadge status={inv.status} />
                  </Td>
                  <Td className="text-xs text-on-surface-variant">
                    {inv.session ? titleCase(inv.session.status) : "-"}
                  </Td>
                  <Td className="text-xs text-on-surface-variant">{fmtDateTime(inv.expiresAt)}</Td>
                  <Td className="pr-5 text-right">
                    <div className="flex justify-end gap-1">
                      {inv.link ? (
                        <Button size="sm" variant="ghost" onClick={() => copyLink(inv)}>
                          {copiedId === inv.id ? "Copied!" : "Copy link"}
                        </Button>
                      ) : !inv.session && !["completed", "revoked"].includes(inv.status) ? (
                        <Button size="sm" variant="ghost" disabled={resendingId === inv.id} onClick={() => resend(inv.id)}>
                          {resendingId === inv.id ? "Resending…" : "Resend"}
                        </Button>
                      ) : null}
                      {!["completed", "revoked"].includes(inv.status) ? (
                        <Button size="sm" variant="ghost" onClick={() => setRevokeTarget(inv.id)}>
                          Revoke
                        </Button>
                      ) : null}
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
