"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { staffApi, ApiError } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorNote, Spinner, cn } from "../ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import type { TestDetail } from "./types";

interface PlagRow {
  reportId: string;
  kind: "candidate" | "reference";
  similarityPct: number;
  questionTitle: string;
  a: { sessionId: string; candidateName: string; candidateEmail: string };
  b:
    | { sessionId: string; candidateName: string; candidateEmail: string }
    | { referenceLabel: string | null };
}

interface PlagDetail {
  report: {
    similarityPct: number;
    kind: string;
    questionTitle: string;
    matchedRanges: { aStart: number; aEnd: number; bStart: number; bEnd: number }[];
    a: { name: string; content: string };
    b: { name: string; content: string | null };
  };
}

function pctColor(pct: number) {
  return pct >= 70 ? "bad" : pct >= 40 ? "warn" : "neutral";
}

/** Render source with matched ranges highlighted. */
function HighlightedCode({
  content,
  ranges,
}: {
  content: string;
  ranges: { start: number; end: number }[];
}) {
  const sorted = [...ranges].sort((x, y) => x.start - y.start);
  const parts: { text: string; hit: boolean }[] = [];
  let pos = 0;
  for (const r of sorted) {
    const start = Math.max(pos, r.start);
    const end = Math.min(content.length, r.end);
    if (start >= end) continue;
    if (start > pos) parts.push({ text: content.slice(pos, start), hit: false });
    parts.push({ text: content.slice(start, end), hit: true });
    pos = end;
  }
  if (pos < content.length) parts.push({ text: content.slice(pos), hit: false });
  // Intentionally fixed-dark, independent of the app's light/dark theme (a
  // code diff viewer, same convention as sessions/[id]/page.tsx's raw-output
  // panels) — the amber highlight is likewise a fixed dark-surface-tuned
  // tone, not the theme's semantic warn token, since that token's light-mode
  // value (a dark amber meant for a light background) would be nearly
  // invisible against this permanently-black surface.
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-300">
      {parts.map((p, i) => (
        <span key={i} className={cn(p.hit && "bg-amber-500/30 text-amber-100")}>
          {p.text}
        </span>
      ))}
    </pre>
  );
}

export function PlagiarismTab({ test }: { test: TestDetail }) {
  const [rows, setRows] = useState<PlagRow[] | null>(null);
  const [detail, setDetail] = useState<PlagDetail["report"] | null>(null);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(() => {
    staffApi<{ reports: PlagRow[] }>(`/api/tests/${test.id}/plagiarism`)
      .then((d) => setRows(d.reports))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load plagiarism reports"));
  }, [test.id]);

  useEffect(load, [load]);

  async function scan() {
    setScanning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await staffApi<{ submissions: number }>(`/api/tests/${test.id}/plagiarism-scan`, {
        method: "POST",
      });
      setNotice(
        `Scan queued for ${res.submissions} final coding submission(s). Refresh in a few seconds.`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Scan failed to start");
    } finally {
      setScanning(false);
    }
  }

  async function toggleDetail(reportId: string) {
    if (openReportId === reportId) {
      setOpenReportId(null);
      setDetail(null);
      return;
    }
    setOpenReportId(reportId);
    setDetail(null);
    const d = await staffApi<PlagDetail>(`/api/plagiarism/${reportId}`);
    setDetail(d.report);
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="max-w-xl text-xs text-on-surface-variant">
          Token-based structural similarity (winnowing fingerprints, shared starter code
          subtracted). A high percentage is a <b>strong signal, not proof</b>, always review the
          side-by-side diff. Scans run automatically when a candidate finishes; a full re-scan
          compares every pair again.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={load}>
            Refresh
          </Button>
          <Button size="sm" onClick={scan} disabled={scanning}>
            {scanning ? "Queuing…" : "Run full scan"}
          </Button>
        </div>
      </Card>
      {notice ? (
        <p className="rounded-lg bg-ok-bg px-3 py-2 text-xs text-ok">{notice}</p>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorNote message={loadError} />
          </div>
        ) : !rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No similarity flags"
            hint="Nothing above the 15% reporting threshold (after starter-code subtraction)."
          />
        ) : (
          <Table className="min-w-[680px]">
            <Thead>
              <tr>
                <Th className="pl-5">Similarity</Th>
                <Th>Type</Th>
                <Th>Question</Th>
                <Th>Candidate</Th>
                <Th>Matched with</Th>
                <Th className="pr-5" />
              </tr>
            </Thead>
            <Tbody>
              {rows.map((r) => (
                <Fragment key={r.reportId}>
                  <Tr>
                    <Td className="pl-5">
                      <Badge color={pctColor(r.similarityPct)}>{r.similarityPct}%</Badge>
                    </Td>
                    <Td>
                      <Badge color={r.kind === "reference" ? "accent" : "info"}>
                        {r.kind === "reference" ? "Public source" : "Candidate pair"}
                      </Badge>
                    </Td>
                    <Td className="max-w-48 truncate text-xs">{r.questionTitle}</Td>
                    <Td className="text-xs">
                      <div className="font-medium">{r.a.candidateName}</div>
                      <div className="text-on-surface-variant">{r.a.candidateEmail}</div>
                    </Td>
                    <Td className="text-xs">
                      {"referenceLabel" in r.b ? (
                        <span className="italic text-on-surface-variant">{r.b.referenceLabel}</span>
                      ) : (
                        <>
                          <div className="font-medium">{r.b.candidateName}</div>
                          <div className="text-on-surface-variant">{r.b.candidateEmail}</div>
                        </>
                      )}
                    </Td>
                    <Td className="pr-5 text-right">
                      <button
                        onClick={() => void toggleDetail(r.reportId)}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        {openReportId === r.reportId ? "Hide diff" : "Side-by-side →"}
                      </button>
                    </Td>
                  </Tr>
                  {openReportId === r.reportId ? (
                    <Tr>
                      <Td colSpan={6} className="bg-surface-container-low px-5 py-4">
                        {!detail ? (
                          <Spinner label="Loading diff…" />
                        ) : (
                          <div className="grid gap-3 lg:grid-cols-2">
                            <div>
                              <div className="mb-1 text-xs font-semibold">{detail.a.name}</div>
                              <HighlightedCode
                                content={detail.a.content}
                                ranges={detail.matchedRanges.map((m) => ({
                                  start: m.aStart,
                                  end: m.aEnd,
                                }))}
                              />
                            </div>
                            <div>
                              <div className="mb-1 text-xs font-semibold">{detail.b.name}</div>
                              {detail.b.content ? (
                                <HighlightedCode
                                  content={detail.b.content}
                                  ranges={detail.matchedRanges.map((m) => ({
                                    start: m.bStart,
                                    end: m.bEnd,
                                  }))}
                                />
                              ) : (
                                <p className="text-xs text-on-surface-variant">
                                  Reference content unavailable.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  ) : null}
                </Fragment>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
