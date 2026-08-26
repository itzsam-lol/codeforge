"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { Check, Minus, X } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { TierHandle } from "@/components/arena/TierHandle";
import { arenaApi } from "@/lib/arenaApi";

interface StandingsQuestion {
  contestQuestionId: string;
  seq: number;
}

interface StandingsEntry {
  rank: number;
  handle: string;
  name: string;
  rating: number;
  score: number;
  ratingDelta: number | null;
  questionStatus: Record<string, "accepted" | "attempted">;
}

interface StandingsResponse {
  questions: StandingsQuestion[];
  leaderboard: StandingsEntry[];
}

function QuestionCell({ status }: { status: "accepted" | "attempted" | undefined }) {
  if (status === "accepted") return <Check className="mx-auto size-4 text-emerald-400" />;
  if (status === "attempted") return <X className="mx-auto size-4 text-rose-400" />;
  return <Minus className="mx-auto size-4 text-slate-600" />;
}

export function ContestStandingsTable({ slug, refreshInterval }: { slug: string; refreshInterval?: number }) {
  const { data, isLoading } = useSWR<StandingsResponse>(`/api/arena/contests/${slug}/leaderboard`, arenaApi, {
    refreshInterval,
  });

  if (isLoading) return <p className="py-8 text-center text-sm text-slate-500">Loading…</p>;
  if (!data || data.leaderboard.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No standings yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5 font-medium">Rank</th>
            <th className="px-4 py-2.5 font-medium">Participant</th>
            {data.questions.map((q) => (
              <th key={q.contestQuestionId} className="px-3 py-2.5 text-center font-medium">
                {q.seq}
              </th>
            ))}
            <th className="px-4 py-2.5 text-right font-medium">Score</th>
            <th className="px-4 py-2.5 text-right font-medium">Δ Rating</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {data.leaderboard.map((entry) => (
            <tr key={entry.handle} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 font-mono text-slate-400">#{entry.rank}</td>
              <td className="px-4 py-2.5">
                <TierHandle handle={entry.handle} rating={entry.rating} name={entry.name} className="text-sm" />
              </td>
              {data.questions.map((q) => (
                <td key={q.contestQuestionId} className="px-3 py-2.5">
                  <QuestionCell status={entry.questionStatus[q.contestQuestionId]} />
                </td>
              ))}
              <td className="px-4 py-2.5 text-right font-mono font-semibold text-white">{entry.score}</td>
              <td
                className={`px-4 py-2.5 text-right font-mono ${
                  entry.ratingDelta == null ? "text-slate-500" : entry.ratingDelta >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {entry.ratingDelta == null ? "—" : entry.ratingDelta >= 0 ? `+${entry.ratingDelta}` : entry.ratingDelta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ArenaContestLeaderboardPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <section className="px-6 py-20">
      <SectionHeading eyebrow="Arena" title="Standings" tone="dark" subtitle="Live and final results for this contest." />
      <div className="mx-auto mt-10 max-w-4xl rounded-2xl border border-white/10 bg-white/[0.02] p-2">
        <ContestStandingsTable slug={slug} />
      </div>
    </section>
  );
}
