"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { Clock, Trophy, ShieldCheck, Users, ChevronDown } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/arena/Markdown";
import { Skeleton } from "@/components/arena/Skeleton";
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
  registeredCount: number;
  questions: { contestQuestionId: string; seq: number; title: string; difficulty: string; points: number }[];
  myParticipation: { status: string; score: number; rank: number | null } | null;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function useCountdownParts(target: string) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(target).getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRemaining(Math.max(0, new Date(target).getTime() - Date.now())), 1000);
    return () => clearInterval(id);
  }, [target]);
  const totalSec = Math.floor(remaining / 1000);
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
    done: remaining <= 0,
  };
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 sm:px-5 sm:py-4">
      <span className="font-mono text-2xl font-bold text-white sm:text-3xl">{String(value).padStart(2, "0")}</span>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
    </div>
  );
}

function CountdownTimer({ startAt, onDone }: { startAt: string; onDone: () => void }) {
  const { days, hours, minutes, seconds, done } = useCountdownParts(startAt);
  useEffect(() => {
    if (done) onDone();
  }, [done, onDone]);
  return (
    <div className="mt-6 flex gap-3">
      {days > 0 ? <CountdownBox value={days} label="Days" /> : null}
      <CountdownBox value={hours} label="Hours" />
      <CountdownBox value={minutes} label="Minutes" />
      <CountdownBox value={seconds} label="Seconds" />
    </div>
  );
}

interface QuestionEditorialDetail {
  title: string;
  editorial: string | null;
}

export function EditorialRow({ slug, contestQuestionId, seq, title }: { slug: string; contestQuestionId: string; seq: number; title: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useSWR<QuestionEditorialDetail>(
    open ? `/api/arena/contests/${slug}/questions/${contestQuestionId}` : null,
    arenaApi
  );
  return (
    <div className="px-5 py-3.5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-sm text-slate-200">
          {seq}. {title}
        </span>
        <ChevronDown className={`size-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="prose prose-invert prose-sm mt-3 max-w-none text-slate-300">
          {!data ? (
            <p className="text-slate-500">Loading…</p>
          ) : data.editorial ? (
            <Markdown>{data.editorial}</Markdown>
          ) : (
            <p className="text-slate-500">No editorial written for this problem yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function ArenaContestDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useArenaAuth();
  // Don't fire until the auth token has finished restoring (BUG-2): this
  // response's myParticipation field depends on whether a token is sent, so
  // firing early caches a wrongly-unauthenticated result SWR won't refetch.
  const { data, error, mutate } = useSWR<ContestDetail>(authLoading ? null : `/api/arena/contests/${slug}`, arenaApi);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [startingVirtual, setStartingVirtual] = useState(false);

  if (error) {
    return <p className="px-6 py-24 text-center text-sm text-rose-400">This contest couldn&apos;t be found.</p>;
  }
  if (!data) {
    return (
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-10 w-2/3" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
          <div className="mt-6 flex gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="mt-8 flex gap-3">
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-36 rounded-lg" />
          </div>
          <div className="mt-14 space-y-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        </div>
      </section>
    );
  }

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

  async function startVirtual() {
    if (!user) {
      router.push("/arena/auth/login");
      return;
    }
    setStartingVirtual(true);
    setRegisterError(null);
    try {
      await arenaApi(`/api/arena/contests/${slug}/start-virtual`, { method: "POST" });
      router.push(`/arena/contests/${slug}/compete`);
    } catch (err) {
      setRegisterError(err instanceof ApiError ? err.message : "Could not start a virtual run");
      setStartingVirtual(false);
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
          <span className="flex items-center gap-1.5">
            <Users className="size-4" /> {data.registeredCount} registered
          </span>
        </div>

        {data.status === "scheduled" ? <CountdownTimer startAt={data.startAt} onDone={() => mutate()} /> : null}

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
          ) : data.status === "completed" ? (
            <Button size="lg" variant="outline" disabled={startingVirtual || authLoading} onClick={startVirtual}>
              {startingVirtual ? "Starting…" : "Start virtual contest"}
            </Button>
          ) : null}
          <Button href={`/arena/contests/${slug}/leaderboard`} variant="outline" size="lg">
            View standings
          </Button>
          {["live", "grading", "completed"].includes(data.status) ? (
            <Button href={`/arena/contests/${slug}/discuss`} variant="outline" size="lg">
              Discuss
            </Button>
          ) : null}
        </div>
        {registerError ? <p className="mt-3 text-sm text-rose-400">{registerError}</p> : null}

        <div className="mt-14">
          <h2 className="text-lg font-semibold text-white">Problems</h2>
          <div className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10">
            {data.questions.map((q) =>
              data.status === "completed" ? (
                <EditorialRow key={q.contestQuestionId} slug={slug} contestQuestionId={q.contestQuestionId} seq={q.seq} title={q.title} />
              ) : (
                <div key={q.contestQuestionId} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-200">
                    {q.seq}. {isLive || data.status === "grading" ? q.title : "???"}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="capitalize">{q.difficulty}</span>
                    <span>{q.points} pts</span>
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
