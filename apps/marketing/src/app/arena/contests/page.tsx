"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Trophy, Clock, ListChecks } from "lucide-react";
import { RevealGroup } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { arenaApi } from "@/lib/arenaApi";
import { cn } from "@/lib/utils";

interface ContestSummary {
  contestId: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  startAt: string;
  endAt: string;
  questionCount: number;
  proctoringLevel: string;
}

const TABS = [
  { key: "live", label: "Live now" },
  { key: "scheduled", label: "Upcoming" },
  { key: "completed", label: "Past" },
] as const;

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ArenaContestsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("live");
  const { data, isLoading } = useSWR<{ contests: ContestSummary[] }>(
    `/api/arena/contests?status=${tab}`,
    arenaApi
  );
  const contests = data?.contests ?? [];

  return (
    <section className="px-6 py-20">
      <SectionHeading eyebrow="Arena" title="Contests" tone="dark" subtitle="Weekly coding battles, open to everyone." />

      <div className="mx-auto mt-10 flex max-w-4xl justify-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              tab === t.key ? "bg-accent text-white" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-10 max-w-4xl">
        {isLoading ? (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        ) : contests.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No {TABS.find((t) => t.key === tab)?.label.toLowerCase()} contests right now.</p>
        ) : (
          <RevealGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {contests.map((c) => (
              <Link
                key={c.contestId}
                href={`/arena/contests/${c.slug}`}
                className="group block rounded-2xl border border-white/10 bg-white/5 p-6 transition duration-300 hover:-translate-y-1 hover:border-accent/40 hover:bg-white/[0.07]"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="size-4 text-accent-soft" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent-soft">{c.status}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-white group-hover:text-accent-soft">{c.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{c.description}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" /> {fmt(c.startAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ListChecks className="size-3.5" /> {c.questionCount} problems
                  </span>
                </div>
              </Link>
            ))}
          </RevealGroup>
        )}
      </div>
    </section>
  );
}
