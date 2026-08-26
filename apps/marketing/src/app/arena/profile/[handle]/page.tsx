"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { Trophy, Flame, Globe } from "lucide-react";
import { Reveal, RevealGroup } from "@/components/Reveal";
import { arenaApi } from "@/lib/arenaApi";

interface Profile {
  handle: string;
  name: string;
  avatarUrl: string | null;
  bio: string;
  country: string | null;
  rating: number;
  createdAt: string;
  stats: { totalContests: number; practiceSolved: number };
  badges: { key: string; name: string; description: string; awardedAt: string; contextLabel: string | null }[];
  contestHistory: { contestId: string; score: number; rank: number | null; ratingBefore: number | null; ratingAfter: number | null }[];
}

export default function ArenaProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { data, error } = useSWR<{ profile: Profile }>(`/api/arena/users/${handle}`, arenaApi);

  if (error) return <p className="px-6 py-24 text-center text-sm text-rose-400">No profile with that handle.</p>;
  if (!data) return <p className="px-6 py-24 text-center text-sm text-slate-500">Loading…</p>;
  const p = data.profile;

  return (
    <section className="px-6 py-20">
      <Reveal className="mx-auto max-w-3xl">
        <div className="flex items-center gap-5">
          <div className="flex size-16 items-center justify-center rounded-full bg-accent/20 text-2xl font-semibold text-accent-soft">
            {p.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">{p.name}</h1>
            <p className="text-sm text-slate-400">
              @{p.handle} {p.country ? <span className="ml-2 inline-flex items-center gap-1"><Globe className="size-3" />{p.country}</span> : null}
            </p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-3xl font-bold text-accent-soft">{p.rating}</div>
            <div className="text-xs text-slate-500">rating</div>
          </div>
        </div>

        {p.bio ? <p className="mt-4 text-sm text-slate-300">{p.bio}</p> : null}

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white/5 p-4 text-center">
            <div className="text-2xl font-semibold text-white">{p.stats.totalContests}</div>
            <div className="text-xs text-slate-500">Contests</div>
          </div>
          <div className="rounded-xl bg-white/5 p-4 text-center">
            <div className="text-2xl font-semibold text-white">{p.stats.practiceSolved}</div>
            <div className="text-xs text-slate-500">Problems solved</div>
          </div>
          <div className="rounded-xl bg-white/5 p-4 text-center">
            <div className="text-2xl font-semibold text-white">{p.badges.length}</div>
            <div className="text-xs text-slate-500">Badges</div>
          </div>
        </div>

        {p.badges.length > 0 ? (
          <div className="mt-10">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Trophy className="size-4 text-accent-soft" /> Badges
            </h2>
            <RevealGroup className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {p.badges.map((b) => (
                <div key={b.key} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <Flame className="size-5 text-accent-soft" />
                  <div className="mt-2 text-sm font-medium text-white">{b.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{b.description}</div>
                </div>
              ))}
            </RevealGroup>
          </div>
        ) : null}

        {p.contestHistory.length > 0 ? (
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-white">Contest history</h2>
            <div className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10">
              {p.contestHistory.map((c) => {
                const delta = c.ratingBefore != null && c.ratingAfter != null ? c.ratingAfter - c.ratingBefore : null;
                return (
                  <div key={c.contestId} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-slate-300">Rank #{c.rank ?? "—"}</span>
                    <span className="text-slate-400">{c.score} pts</span>
                    <span className={delta != null && delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      {delta != null ? (delta >= 0 ? `+${delta}` : delta) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Reveal>
    </section>
  );
}
