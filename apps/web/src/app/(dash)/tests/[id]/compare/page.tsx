"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { staffApi, ApiError } from "@/lib/api";
import { Badge, Card, ErrorNote, Spinner, StatusBadge } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { IconArrowLeft } from "@/components/icons";
import { fmtDateTime, fmtScore } from "@/lib/format";

interface BreakdownRow {
  order: number;
  points: number;
  title: string;
  finalSubmission: { effectiveScore: number; maxPoints: number } | null;
}

interface SessionPayload {
  session: {
    id: string;
    candidateName: string;
    candidateEmail: string;
    status: string;
    submittedAt: string | null;
    integrityScore: number | null;
    shortlisted: boolean;
    tags: string[];
  };
  test: { id: string; title: string };
  totals: { totalScore: number; maxScore: number };
  breakdown: BreakdownRow[];
}

export default function CompareSessionsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const sessionIds = (searchParams.get("sessions") ?? "").split(",").filter(Boolean);

  const [payloads, setPayloads] = useState<SessionPayload[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionIds.length < 2) {
      setLoadError("Select 2 or 3 candidates from the Results tab to compare them.");
      return;
    }
    Promise.all(sessionIds.map((id) => staffApi<SessionPayload>(`/api/sessions/${id}`)))
      .then(setPayloads)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load these sessions"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) return <ErrorNote message={loadError} />;
  if (!payloads) return <Spinner label="Loading candidates…" />;

  const maxSlots = Math.max(...payloads.map((p) => p.breakdown.length));
  const slotRows = Array.from({ length: maxSlots }, (_, i) =>
    payloads.map((p) => p.breakdown.find((b) => b.order === i) ?? null)
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href={`/tests/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface"
      >
        <IconArrowLeft size={16} />
        {payloads[0]?.test.title ?? "Test"}
      </Link>

      <h1 className="text-headline-md text-on-surface">
        Comparing {payloads.length} candidate{payloads.length === 1 ? "" : "s"}
      </h1>

      <Card>
        <Table>
          <Thead>
            <tr>
              <Th className="pl-5">Candidate</Th>
              <Th>Status</Th>
              <Th>Score</Th>
              <Th>Integrity</Th>
              <Th>Submitted</Th>
              <Th className="pr-5">Tags</Th>
            </tr>
          </Thead>
          <Tbody>
            {payloads.map((p) => (
              <Tr key={p.session.id}>
                <Td className="pl-5">
                  <Link href={`/sessions/${p.session.id}`} className="font-medium text-accent hover:underline">
                    {p.session.candidateName}
                  </Link>
                  <div className="text-xs text-on-surface-variant">{p.session.candidateEmail}</div>
                </Td>
                <Td>
                  <StatusBadge status={p.session.status} />
                </Td>
                <Td className="font-semibold">{fmtScore(p.totals.totalScore, p.totals.maxScore)}</Td>
                <Td>{p.session.integrityScore ?? "-"}</Td>
                <Td className="text-on-surface-variant">{fmtDateTime(p.session.submittedAt)}</Td>
                <Td className="pr-5">
                  {p.session.shortlisted ? <Badge color="accent">Shortlisted</Badge> : null}
                  {p.session.tags.map((t) => (
                    <Badge key={t} color="neutral">
                      {t}
                    </Badge>
                  ))}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>

      <Card>
        <div className="px-5 py-3 text-sm font-semibold text-on-surface">Per-question scores</div>
        <Table>
          <Thead>
            <tr>
              <Th className="pl-5">Question</Th>
              {payloads.map((p) => (
                <Th key={p.session.id}>{p.session.candidateName}</Th>
              ))}
            </tr>
          </Thead>
          <Tbody>
            {slotRows.map((row, i) => {
              // Pool-drawn slots can hand different candidates different
              // questions for the same order index — title the row from
              // whichever candidate actually has one, not a fixed lookup.
              const label = row.find((r) => r)?.title ?? `Question ${i + 1}`;
              return (
                <Tr key={i}>
                  <Td className="pl-5 font-medium">{label}</Td>
                  {row.map((r, j) => (
                    <Td key={j}>{r?.finalSubmission ? fmtScore(r.finalSubmission.effectiveScore, r.finalSubmission.maxPoints) : "-"}</Td>
                  ))}
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Card>
    </div>
  );
}
