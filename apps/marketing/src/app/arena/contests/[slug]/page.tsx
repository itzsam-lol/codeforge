"use client";

import { useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { Clock, Trophy, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/arena/Markdown";
import { ApiError, arenaApi } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";

interface ContestDetail {
  contestId: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  startAt: string;
  endAt: string;
  scoringMode: string;
  proctoringLevel: string;
  webcamRequired: boolean;
  fullscreenRequired: boolean;
  questions: { contestQuestionId: string; seq: number; title: string; difficulty: string; points: number }[];
  myParticipation: { status: string; score: number; rank: number | null } | null;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ArenaContestDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useArenaAuth();
  const { data, error, mutate } = useSWR<ContestDetail>(`/api/arena/contests/${slug}`, arenaApi);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  if (error) {
    return <p className="px-6 py-24 text-center text-sm text-rose-400">This contest couldn&apos;t be found.</p>;
  }
  if (!data) return <p className="px-6 py-24 text-center text-sm text-slate-500">Loading…</p>;

  async function register() {
    if (!user) {
      router.push("/arena/auth/login");
      return;
    }
    setRegistering(true);
    setRegisterError(null);
    try {
      await arenaApi(`/api/arena/contests/${slug}/register`, { method: "POST" });
      mutate();
    } catch (err) {
      setRegisterError(err instanceof ApiError ? err.message : "Could not register");
    } finally {
      setRegistering(false);
    }
  }

  const isLive = data.status === "live";
  const canEnter = isLive && data.myParticipation;

  return (
    <section className="px-6 py-20">
      <Reveal className="mx-auto max-w-3xl">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-soft">{data.status}</span>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">{data.title}</h1>
        <div className="prose prose-invert prose-sm mt-4 max-w-none text-slate-300">
          <Markdown>{data.description}</Markdown>
        </div>

        <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-400">
          <span className="flex items-center gap-1.5">
            <Clock className="size-4" /> {fmt(data.startAt)} – {fmt(data.endAt)}
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy className="size-4" /> {data.questions.length} problems, {data.scoringMode.replace("_", " ")} scoring
          </span>
          {data.proctoringLevel !== "none" ? (
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4" /> {data.proctoringLevel} proctoring
            </span>
          ) : null}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {canEnter ? (
            <Button href={`/arena/contests/${slug}/compete`} size="lg">
              Enter contest
            </Button>
          ) : data.myParticipation ? (
            <span className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium text-white">
              You&apos;re registered — starts {fmt(data.startAt)}
            </span>
          ) : ["scheduled", "live"].includes(data.status) ? (
            <Button size="lg" disabled={registering || authLoading} onClick={register}>
              {registering ? "Registering…" : "Register"}
            </Button>
          ) : null}
          <Button href="/arena/leaderboard" variant="outline" size="lg">
            View leaderboard
          </Button>
        </div>
        {registerError ? <p className="mt-3 text-sm text-rose-400">{registerError}</p> : null}

        <div className="mt-14">
          <h2 className="text-lg font-semibold text-white">Problems</h2>
          <div className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10">
            {data.questions.map((q) => (
              <div key={q.contestQuestionId} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-slate-200">
                  {q.seq}. {isLive || data.status === "completed" || data.status === "grading" ? q.title : "???"}
                </span>
                <span className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="capitalize">{q.difficulty}</span>
                  <span>{q.points} pts</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
