"use client";

import { useEffect, useState } from "react";
import { staffApi, staffApiDownload, ApiError } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorNote, Spinner } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  actorName: string;
  actorEmail: string;
  createdAt: string;
}

const ACTION_COLOR: Record<string, "green" | "amber" | "red" | "indigo" | "slate"> = {
  "score.override": "amber",
  "invitation.revoke": "red",
  "candidate.delete": "red",
  "org.branding.update": "indigo",
  "question.archive": "red",
  "test.publish": "green",
  "test.close": "slate",
  "test.archive": "red",
  "user.create": "indigo",
};

function describe(e: AuditEntry): string {
  switch (e.action) {
    case "score.override":
      return `Overrode a score to ${String(e.metadata.manualScore ?? "cleared")}`;
    case "invitation.revoke":
      return `Revoked the invitation for ${String(e.metadata.candidateEmail ?? e.targetId)}`;
    case "candidate.delete":
      return `Deleted candidate ${String(e.metadata.candidateName ?? "")} (${String(e.metadata.candidateEmail ?? e.targetId)}) and all their data for this test`;
    case "org.branding.update":
      return "Updated candidate-facing branding";
    case "question.archive":
      return `Archived question "${String(e.metadata.title ?? e.targetId)}"`;
    case "test.publish":
      return `Published "${String(e.metadata.title ?? e.targetId)}"`;
    case "test.close":
      return `Closed "${String(e.metadata.title ?? e.targetId)}"`;
    case "test.archive":
      return `Archived test "${String(e.metadata.title ?? e.targetId)}"`;
    case "user.create":
      return `Added staff user ${String(e.metadata.email ?? "")} (${String(e.metadata.role ?? "")})`;
    default:
      return `${titleCase(e.action.replace(/\./g, " "))} on ${e.targetType}`;
  }
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    staffApi<{ entries: AuditEntry[] }>("/api/audit-log")
      .then((d) => setEntries(d.entries))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load the activity log"));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-headline-md text-on-surface">Activity</h1>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => staffApiDownload("/api/audit-log.csv", "audit-log.csv")}
        >
          Export CSV
        </Button>
      </div>
      <p className="text-sm text-on-surface-variant">
        A trail of sensitive staff actions: score overrides, invitation revocations, branding
        changes, and test/question lifecycle events, most recent first.
      </p>
      {loadError ? (
        <ErrorNote message={loadError} />
      ) : !entries ? (
        <Spinner />
      ) : (
        <Card>
          {entries.length === 0 ? (
            <EmptyState title="No activity yet" hint="Sensitive staff actions will show up here." />
          ) : (
            <div className="divide-y divide-outline-variant">
              {entries.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge color={ACTION_COLOR[e.action] ?? "slate"}>{e.action}</Badge>
                    <span>{describe(e)}</span>
                  </div>
                  <div className="text-xs text-on-surface-variant">
                    {e.actorName} · {fmtDateTime(e.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
