"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { hqApi, ApiError } from "@/lib/api";
import { Card, EmptyState, ErrorNote, Spinner, StatusBadge } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";

interface Standing {
  userId: string;
  handle: string;
  name: string;
  score: number;
  rank: number | null;
  ratingBefore: number | null;
  ratingAfter: number | null;
}

interface Contest {
  id: string;
  title: string;
  status: string;
  resultsSnapshot: Standing[] | null;
}

export default function ContestLeaderboardPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useSWR<{ contest: Contest }>(`/api/contests/${id}`, hqApi);
  const contest = data?.contest;
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load results" : null;

  if (loadError) return <ErrorNote message={loadError} />;
  if (!contest) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-headline-md text-on-surface">{contest.title} — Results</h1>
        <StatusBadge status={contest.status} />
      </div>

      <Card>
        {!contest.resultsSnapshot || contest.resultsSnapshot.length === 0 ? (
          <EmptyState
            title="No results yet"
            hint={
              contest.status === "completed"
                ? "Results haven't synced back from Arena yet."
                : "Results appear here once the contest ends and rating computation finishes."
            }
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Rank</Th>
                <Th>Participant</Th>
                <Th>Score</Th>
                <Th>Rating before</Th>
                <Th>Rating after</Th>
                <Th>Change</Th>
              </tr>
            </Thead>
            <Tbody>
              {contest.resultsSnapshot
                .slice()
                .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
                .map((s) => {
                  const delta = s.ratingBefore != null && s.ratingAfter != null ? s.ratingAfter - s.ratingBefore : null;
                  return (
                    <Tr key={s.userId}>
                      <Td className="pl-5 font-medium">#{s.rank}</Td>
                      <Td>
                        {s.name} <span className="text-on-surface-variant">@{s.handle}</span>
                      </Td>
                      <Td>{s.score}</Td>
                      <Td>{s.ratingBefore}</Td>
                      <Td>{s.ratingAfter}</Td>
                      <Td className={delta != null && delta >= 0 ? "text-ok" : "text-bad"}>
                        {delta != null ? (delta >= 0 ? `+${delta}` : delta) : "—"}
                      </Td>
                    </Tr>
                  );
                })}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
