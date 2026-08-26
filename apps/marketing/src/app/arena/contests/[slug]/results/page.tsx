"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { Check, Minus, Trophy, X } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/SectionHeading";
import { Skeleton } from "@/components/arena/Skeleton";
import { TierHandle } from "@/components/arena/TierHandle";
import { EditorialRow } from "../page.client";
import { arenaApi } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";

type QuestionStatusValue = "accepted" | "attempted" | "answered";

interface ContestDetail {
  title: string;
  status: string;
  questions: { contestQuestionId: string; seq: number; title: string; points: number }[];
  myParticipation: {
    status: string;
    score: number;
    rank: number | null;
    questionStatus: Record<string, QuestionStatusValue>;
  } | null;
}

interface StandingsEntry {
  rank: number;
  handle: string;
  name: string;
  rating: number;
  score: number;
  ratingDelta: number | null;
  questionStatus: Record<string, QuestionStatusValue>;
}

interface StandingsResponse {
  leaderboard: StandingsEntry[];
}

function StatusIcon({ status }: { status: QuestionStatusValue | undefined }) {
  if (status === "accepted") return <Check className="size-4 text-emerald-400" />;
  if (status === "answered") return <Minus className="size-4 text-sky-400" />;
  if (status === "attempted") return <X className="size-4 text-rose-400" />;
  return <Minus className="size-4 text-slate-600" />;
}

export default function ArenaContestResultsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, loading: authLoading } = useArenaAuth();

  const { data: contest } = useSWR<ContestDetail>(authLoading ? null : `/api/arena/contests/${slug}`, arenaApi, {
    // Grading (arenaRating.ts's computeContestRatings) runs shortly after a
    // contest's end via a background sweep — poll until the status flips
    // past "grading" instead of leaving the visitor stuck on a stale page.
    refreshInterval: (data) => (data && ["completed"].includes(data.status) ? 0 : 5_000),
  });
  const { data: standings } = useSWR<StandingsResponse>(
    contest?.status === "completed" ? `/api/arena/contests/${slug}/leaderboard` : null,
    arenaApi
  );

  if (!contest || authLoading) {
    return (
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-10 w-2/3" />
          <Skeleton className="mt-8 h-32 w-full rounded-2xl" />
        </div>
      </section>
    );
  }

  if (!contest.myParticipation) {
    return <p className="px-6 py-24 text-center text-sm text-slate-400">You didn&apos;t take part in this contest.</p>;
  }

  if (contest.status !== "completed") {
    return (
      <section className="px-6 py-24 text-center">
        <p className="text-sm text-slate-400">
          {contest.status === "grading" ? "Grading in progress — this page will update automatically." : "This contest hasn't ended yet."}
        </p>
      </section>
    );
  }

  const own = standings?.leaderboard.find((e) => e.handle === user?.handle);
  const top3 = standings?.leaderboard.slice(0, 3) ?? [];

  return (
    <section className="px-6 py-20">
      <Reveal className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="Results" title={contest.title} tone="dark" subtitle="Final standings for this contest." />

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center">
            <div className="text-2xl font-bold text-white">
              {own?.rank ?? contest.myParticipation.rank ?? "—"}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">Rank</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center">
            <div className="text-2xl font-bold text-white">{own?.score ?? contest.myParticipation.score}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">Score</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center">
            <div
              className={`text-2xl font-bold ${
                own?.ratingDelta == null ? "text-slate-500" : own.ratingDelta >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {own?.ratingDelta == null ? "—" : own.ratingDelta >= 0 ? `+${own.ratingDelta}` : own.ratingDelta}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">Rating change</div>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-semibold text-white">Your questions</h2>
          <div className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10">
            {contest.questions.map((q) => (
              <div key={q.contestQuestionId} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-slate-200">
                  {q.seq}. {q.title}
                </span>
                <span className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{q.points} pts</span>
                  <StatusIcon status={contest.myParticipation!.questionStatus[q.contestQuestionId]} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {top3.length > 0 ? (
          <div className="mt-10">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Trophy className="size-4 text-amber-400" /> Top performers
            </h2>
            <div className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10">
              {top3.map((entry) => (
                <div key={entry.handle} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-slate-400">#{entry.rank}</span>
                    <TierHandle handle={entry.handle} rating={entry.rating} name={entry.name} className="text-sm" />
                  </div>
                  <span className="font-mono text-sm font-semibold text-white">{entry.score}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-10">
          <h2 className="text-lg font-semibold text-white">Editorials</h2>
          <div className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10">
            {contest.questions.map((q) => (
              <EditorialRow key={q.contestQuestionId} slug={slug} contestQuestionId={q.contestQuestionId} seq={q.seq} title={q.title} />
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button href={`/arena/contests/${slug}/leaderboard`} variant="outline" size="lg">
            Full standings
          </Button>
          <Button href="/arena/contests" size="lg">
            More contests
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
