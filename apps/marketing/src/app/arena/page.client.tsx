"use client";

import useSWR from "swr";
import Link from "next/link";
import { Trophy, Users, Sparkles, ShieldCheck, ArrowRight } from "lucide-react";
import { Reveal, RevealGroup } from "@/components/Reveal";
import { AnimatedGroup } from "@/components/animated-group";
import { SectionHeading } from "@/components/SectionHeading";
import { CountUp } from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/arena/Skeleton";
import { arenaApi } from "@/lib/arenaApi";

interface ContestSummary {
  contestId: string;
  slug: string;
  title: string;
  status: string;
  startAt: string;
  questionCount: number;
}

const HOW_IT_WORKS = [
  { icon: Users, title: "Register", body: "Create a free account with email or GitHub/Google — takes seconds." },
  { icon: Trophy, title: "Compete", body: "Solve real coding problems against the clock, alongside everyone else registered." },
  { icon: Sparkles, title: "Climb", body: "Your rating updates after every contest. Earn badges, chase the leaderboard." },
];

export default function ArenaLandingPage() {
  const { data: stats } = useSWR<{ totalUsers: number; totalContests: number; totalAccepted: number }>(
    "/api/arena/stats",
    arenaApi
  );
  const { data: upcoming } = useSWR<{ contests: ContestSummary[] }>("/api/arena/contests?status=scheduled", arenaApi);
  const { data: live } = useSWR<{ contests: ContestSummary[] }>("/api/arena/contests?status=live", arenaApi);
  const contestsLoading = live === undefined || upcoming === undefined;
  const featured = [...(live?.contests ?? []), ...(upcoming?.contests ?? [])].slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="cf-hero-mesh relative overflow-hidden px-6 pb-24 pt-28">
        <div className="cf-grid cf-radial-mask absolute inset-0" />
        <AnimatedGroup className="relative mx-auto max-w-3xl text-center">
          <span className="cf-glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-white">
            <span className="cf-blink size-1.5 rounded-full bg-emerald-400" /> {live?.contests.length ? `${live.contests.length} contest live now` : "New weekly contests"}
          </span>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            CodeForge <span className="text-accent-soft">Arena</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-300">
            Weekly competitive coding contests. Real problems, a live leaderboard, and a rating that actually
            means something.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button href="/arena/auth/register" size="lg">
              Join Arena <ArrowRight className="size-4" />
            </Button>
            <Button href="/arena/practice/demo" variant="glass" size="lg">
              Try the proctoring demo
            </Button>
          </div>
        </AnimatedGroup>

        <Reveal delay={0.2} className="relative mx-auto mt-16 grid max-w-2xl grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-3xl font-bold text-white">
              {stats ? <CountUp value={stats.totalUsers} /> : <Skeleton className="mx-auto h-8 w-14" />}
            </div>
            <div className="mt-1 text-xs text-slate-400">Competitors</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">
              {stats ? <CountUp value={stats.totalContests} /> : <Skeleton className="mx-auto h-8 w-14" />}
            </div>
            <div className="mt-1 text-xs text-slate-400">Contests held</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">
              {stats ? <CountUp value={stats.totalAccepted} /> : <Skeleton className="mx-auto h-8 w-14" />}
            </div>
            <div className="mt-1 text-xs text-slate-400">Problems solved</div>
          </div>
        </Reveal>
      </section>

      {/* Featured contests */}
      {contestsLoading || featured.length > 0 ? (
        <section className="border-t border-white/10 px-6 py-20">
          <SectionHeading eyebrow="Right now" title="Live &amp; upcoming" tone="dark" />
          {contestsLoading ? (
            <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-3 h-4 w-32" />
                  <Skeleton className="mt-2 h-3 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <RevealGroup className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
              {featured.map((c) => (
                <Link
                  key={c.contestId}
                  href={`/arena/contests/${c.slug}`}
                  className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition duration-300 hover:-translate-y-1 hover:border-accent/40"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent-soft">{c.status}</span>
                  <h3 className="mt-2 font-semibold text-white group-hover:text-accent-soft">{c.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">{c.questionCount} problems</p>
                </Link>
              ))}
            </RevealGroup>
          )}
          <div className="mt-8 text-center">
            <Button href="/arena/contests" variant="outline" size="sm">
              View all contests
            </Button>
          </div>
        </section>
      ) : null}

      {/* How it works */}
      <section className="border-t border-white/10 px-6 py-20">
        <SectionHeading eyebrow="How it works" title="Three steps to your first rating" tone="dark" />
        <RevealGroup className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent/15 text-accent-soft">
                <step.icon className="size-6" />
              </div>
              <h3 className="mt-4 font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{step.body}</p>
            </div>
          ))}
        </RevealGroup>
      </section>

      {/* Proctoring showcase */}
      <section className="border-t border-white/10 bg-white/[0.02] px-6 py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <ShieldCheck className="mx-auto size-8 text-accent-soft" />
          <h2 className="mt-4 text-2xl font-semibold text-white">Built on CodeForge&apos;s real proctoring stack</h2>
          <p className="mt-3 text-sm text-slate-400">
            Arena runs the same webcam monitoring, tab-switch detection, and copy/paste blocking that powers
            CodeForge&apos;s enterprise assessments — genuinely enforced, not simulated. See it for yourself.
          </p>
          <Button href="/arena/practice/demo" variant="outline" size="md" className="mt-6">
            Launch the demo
          </Button>
        </Reveal>
      </section>
    </>
  );
}
