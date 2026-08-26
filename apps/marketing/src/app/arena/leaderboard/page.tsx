"use client";

import useSWR from "swr";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { arenaApi } from "@/lib/arenaApi";
import { cn } from "@/lib/utils";
import { tierFor } from "@/lib/arenaTiers";

interface LeaderboardEntry {
  rank: number;
  handle: string;
  name: string;
  avatarUrl: string | null;
  rating: number;
  country: string | null;
}

export default function ArenaLeaderboardPage() {
  const { data, isLoading } = useSWR<{ leaderboard: LeaderboardEntry[] }>("/api/arena/leaderboard", arenaApi);

  return (
    <section className="px-6 py-20">
      <SectionHeading eyebrow="Arena" title="Global leaderboard" tone="dark" subtitle="Ranked by rating across all contests." />

      <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-white/10">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          (data?.leaderboard ?? []).map((entry, i) => {
            const [, tierName, tierColor] = tierFor(entry.rating);
            return (
              <Link
                key={entry.handle}
                href={`/arena/profile/${entry.handle}`}
                className={cn(
                  "flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-white/5",
                  i !== 0 && "border-t border-white/10"
                )}
              >
                <div className="flex items-center gap-4">
                  <span className="w-8 text-right font-mono text-sm text-slate-500">#{entry.rank}</span>
                  <div>
                    <div className="text-sm font-medium text-white">{entry.name}</div>
                    <div className={cn("text-xs", tierColor)}>{tierName}</div>
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold text-white">{entry.rating}</span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
