"use client";

import useSWR from "swr";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { RevealGroup } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { Button } from "@/components/ui/button";
import { arenaApi } from "@/lib/arenaApi";
import { cn } from "@/lib/utils";

interface Problem {
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

export default function ArenaPracticePage() {
  const { data, isLoading } = useSWR<{ problems: Problem[] }>("/api/arena/practice", arenaApi);

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

      <div className="mx-auto mt-10 max-w-2xl">
        {isLoading ? (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <RevealGroup className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
            {(data?.problems ?? []).map((p) => (
              <Link
                key={p.slug}
                href={`/arena/practice/${p.slug}`}
                className="flex items-center justify-between px-5 py-4 transition hover:bg-white/5"
              >
                <span className="text-sm font-medium text-white">{p.title}</span>
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
