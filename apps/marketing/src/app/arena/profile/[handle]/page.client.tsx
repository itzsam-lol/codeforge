"use client";

import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Trophy, Flame, Pencil, ListChecks } from "lucide-react";
import { Reveal, RevealGroup } from "@/components/Reveal";
import { arenaApi } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";
import { tierFor } from "@/lib/arenaTiers";
import { countryName } from "@/lib/countries";
import { CountryFlag } from "@/components/arena/CountryFlag";
import { ActivityHeatmap, type HeatmapDay } from "@/components/arena/ActivityHeatmap";
import { RatingGraph, type RatingPoint } from "@/components/arena/RatingGraph";
import { Skeleton } from "@/components/arena/Skeleton";

interface Profile {
  handle: string;
  name: string;
  avatarUrl: string | null;
  bio: string;
  country: string | null;
  rating: number;
  createdAt: string;
  currentStreak: number;
  stats: { totalContests: number; practiceSolved: number };
  badges: { key: string; name: string; description: string; awardedAt: string; contextLabel: string | null }[];
  contestHistory: {
    contestId: string;
    contestTitle: string;
    score: number;
    rank: number | null;
    ratingBefore: number | null;
    ratingAfter: number | null;
  }[];
  ratingHistory: RatingPoint[];
}

export default function ArenaProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { user: viewer } = useArenaAuth();
  const { data, error } = useSWR<{ profile: Profile }>(`/api/arena/users/${handle}`, arenaApi);
  const { data: heatmapData } = useSWR<{ heatmap: HeatmapDay[] }>(`/api/arena/users/${handle}/heatmap`, arenaApi);

  if (error) return <p className="px-6 py-24 text-center text-sm text-rose-400">No profile with that handle.</p>;
  if (!data) {
    return (
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-5">
            <Skeleton className="size-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="mt-10 h-6 w-32" />
          <Skeleton className="mt-4 h-64 w-full rounded-xl" />
        </div>
      </section>
    );
  }
  const p = data.profile;
  const isOwnProfile = viewer?.handle === p.handle;
  const [, tierName, tierColor] = tierFor(p.rating);

  return (
    <section className="px-6 py-20">
      <Reveal className="mx-auto max-w-3xl">
        <div className="flex items-center gap-5">
          <div className="flex size-16 items-center justify-center rounded-full bg-accent/20 text-2xl font-semibold text-accent-soft">
            {p.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className={`text-2xl font-semibold ${tierColor}`}>{p.name}</h1>
            <p className="text-sm text-slate-400">
              @{p.handle} · {tierName}{" "}
              {countryName(p.country) ? (
                <span className="ml-2 inline-flex items-center gap-1.5">
                  <CountryFlag code={p.country} />
                  {countryName(p.country)}
                </span>
              ) : null}
            </p>
          </div>
          <div className="ml-auto flex items-start gap-3">
            <div className="text-right">
              <div className="text-3xl font-bold text-accent-soft">{p.rating}</div>
              <div className="text-xs text-slate-500">rating</div>
            </div>
            {isOwnProfile ? (
              <Link
                href="/arena/profile/edit"
                aria-label="Edit profile"
                className="rounded-full bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <Pencil className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>

        {p.bio ? <p className="mt-4 text-sm text-slate-300">{p.bio}</p> : null}

        {p.currentStreak > 0 ? (
          <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-amber-400">
            🔥 {p.currentStreak}-day streak
          </p>
        ) : null}

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

        <div className="mt-10">
          <h2 className="text-lg font-semibold text-white">Rating history</h2>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <RatingGraph history={p.ratingHistory} />
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-semibold text-white">Activity</h2>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            {heatmapData ? (
              <ActivityHeatmap data={heatmapData.heatmap} />
            ) : (
              <Skeleton className="h-28 w-full" />
            )}
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
                  <div key={c.contestId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <span className="min-w-0 truncate text-slate-200">{c.contestTitle}</span>
                    <span className="shrink-0 text-slate-400">Rank #{c.rank ?? "—"}</span>
                    <span className="shrink-0 text-slate-400">{c.score} pts</span>
                    <span className={`shrink-0 ${delta != null && delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {delta != null ? (delta >= 0 ? `+${delta}` : delta) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-10">
          <Link
            href={`/arena/profile/${p.handle}/submissions`}
            className="inline-flex items-center gap-2 text-sm font-medium text-accent-soft hover:underline"
          >
            <ListChecks className="size-4" /> View all submissions
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
