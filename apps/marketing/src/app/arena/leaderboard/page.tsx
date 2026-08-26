"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { arenaApi } from "@/lib/arenaApi";
import { cn } from "@/lib/utils";
import { tierFor } from "@/lib/arenaTiers";
import { COUNTRIES } from "@/lib/countries";

interface LeaderboardEntry {
  rank: number;
  handle: string;
  name: string;
  avatarUrl: string | null;
  rating: number;
  country: string | null;
  verified: boolean;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  page: number;
  pageSize: number;
  total: number;
}

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default function ArenaLeaderboardPage() {
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const params = new URLSearchParams({ page: String(page) });
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (country) params.set("country", country);

  const { data, isLoading } = useSWR<LeaderboardResponse>(`/api/arena/leaderboard?${params}`, arenaApi);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="px-6 py-20">
      <SectionHeading eyebrow="Arena" title="Global leaderboard" tone="dark" subtitle="Ranked by rating across all contests." />

      <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by handle or name…"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
          />
        </div>
        <select
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-accent focus:outline-none"
        >
          <option value="">All countries</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="mx-auto mt-6 max-w-2xl overflow-hidden rounded-2xl border border-white/10">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
        ) : !data || data.leaderboard.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No one matches that search.</p>
        ) : (
          data.leaderboard.map((entry, i) => {
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
                    <div className="flex items-center gap-1.5 text-sm font-medium text-white">
                      {entry.name}
                      {entry.verified ? <ShieldCheck className="size-3.5 text-accent-soft" aria-label="Verified" /> : null}
                    </div>
                    <div className={cn("text-xs", tierColor)}>
                      {tierName}
                      {entry.country ? ` · ${entry.country}` : ""}
                    </div>
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold text-white">{entry.rating}</span>
              </Link>
            );
          })
        )}
      </div>

      {data && totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md bg-white/5 px-3 py-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-md bg-white/5 px-3 py-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
