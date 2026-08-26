"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Check, Search, ShieldCheck } from "lucide-react";
import { RevealGroup } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { Button } from "@/components/ui/button";
import { arenaApi } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";
import { cn } from "@/lib/utils";

interface Problem {
  id: string;
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
}

const DIFFICULTY_COLOR: Record<Problem["difficulty"], string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-rose-400",
};

const DIFFICULTIES: (Problem["difficulty"] | "all")[] = ["all", "easy", "medium", "hard"];

export default function ArenaPracticePage() {
  const { user } = useArenaAuth();
  const { data, isLoading } = useSWR<{ problems: Problem[] }>("/api/arena/practice", arenaApi);
  const { data: solvedData } = useSWR<{ solvedProblemIds: string[] }>(
    user ? "/api/arena/practice/solved" : null,
    arenaApi
  );
  const solved = useMemo(() => new Set(solvedData?.solvedProblemIds ?? []), [solvedData]);

  const [difficulty, setDifficulty] = useState<Problem["difficulty"] | "all">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const p of data?.problems ?? []) for (const t of p.tags) tags.add(t);
    return [...tags].sort();
  }, [data]);

  const filtered = useMemo(() => {
    return (data?.problems ?? []).filter((p) => {
      if (difficulty !== "all" && p.difficulty !== difficulty) return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, difficulty, tag, search]);

  return (
    <section className="px-6 py-20">
      <SectionHeading eyebrow="Arena" title="Practice" tone="dark" subtitle="Solve problems any time — doesn't affect your rating." />

      <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-accent/30 bg-accent/10 p-5 text-center">
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-white">
          <ShieldCheck className="size-4 text-accent-soft" /> Curious about our proctoring? Try the live demo — no account needed.
        </p>
        <Button href="/arena/practice/demo" variant="outline" size="sm" className="mt-3">
          Launch proctoring demo
        </Button>
      </div>

      <div className="mx-auto mt-10 max-w-2xl space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search problems…"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium capitalize transition",
                difficulty === d ? "bg-accent text-white" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              )}
            >
              {d}
            </button>
          ))}
        </div>

        {allTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTag((cur) => (cur === t ? null : t))}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  tag === t
                    ? "border-accent bg-accent/15 text-accent-soft"
                    : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No problems match those filters.</p>
        ) : (
          <RevealGroup className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
            {filtered.map((p) => (
              <Link
                key={p.slug}
                href={`/arena/practice/${p.slug}`}
                className="flex items-center justify-between px-5 py-4 transition hover:bg-white/5"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  {solved.has(p.id) ? <Check className="size-4 text-emerald-400" aria-label="Solved" /> : null}
                  {p.title}
                </span>
                <span className={cn("text-xs font-medium capitalize", DIFFICULTY_COLOR[p.difficulty])}>
                  {p.difficulty}
                </span>
              </Link>
            ))}
          </RevealGroup>
        )}
      </div>
    </section>
  );
}
