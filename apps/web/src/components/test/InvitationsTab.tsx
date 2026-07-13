"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { staffApi, ApiError } from "@/lib/api";
import type { TestDetail } from "./types";
import { Badge, Button, Card, EmptyState, ErrorNote, Spinner, Textarea, statusBadgeColor } from "../ui";
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
  link: string;
  session: { id: string; status: string; startedAt: string | null; submittedAt: string | null } | null;
}

export function InvitationsTab({ test }: { test: TestDetail }) {
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null);
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setBulk((prev) => [prev.trim(), parseCsvToLines(text)].filter(Boolean).join("\n"));
  }

  const load = useCallback(() => {
    staffApi<{ invitations: InvitationRow[] }>(`/api/tests/${test.id}/invitations`).then((d) =>
      setInvitations(d.invitations)
    );
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
      const res = await staffApi<{ created: unknown[]; skipped: string[] }>(
        `/api/tests/${test.id}/invitations`,
        { method: "POST", body: { candidates } }
      );
      setNotice(
        `Invited ${res.created.length} candidate(s)` +
          (res.skipped.length ? `, skipped ${res.skipped.length} already-invited` : "") +
          ". Email delivery uses the console driver in dev, copy links below."
      );
      setBulk("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this invitation link?")) return;
    await staffApi(`/api/invitations/${id}/revoke`, { method: "POST" });
    load();
  }

  async function copyLink(inv: InvitationRow) {
    await navigator.clipboard.writeText(inv.link);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">Invite candidates</h3>
        {test.status !== "published" ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Publish the test before inviting candidates.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">One per line: Name, email</span>
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
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>
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
        <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">
          Invitations {invitations ? `(${invitations.length})` : ""}
        </div>
        {!invitations ? (
          <Spinner />
        ) : invitations.length === 0 ? (
          <EmptyState title="Nobody invited yet" />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-2 font-medium">Candidate</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Session</th>
                <th className="px-3 py-2 font-medium">Expires</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{inv.candidateName}</div>
                    <div className="text-xs text-slate-500">{inv.candidateEmail}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={statusBadgeColor(inv.status)}>{titleCase(inv.status)}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">
                    {inv.session ? titleCase(inv.session.status) : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDateTime(inv.expiresAt)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => copyLink(inv)}>
                        {copiedId === inv.id ? "Copied!" : "Copy link"}
                      </Button>
                      {!["completed", "revoked"].includes(inv.status) ? (
                        <Button size="sm" variant="ghost" onClick={() => revoke(inv.id)}>
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
