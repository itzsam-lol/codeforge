import { Building2, Lock, Palette, ListChecks } from "lucide-react";
import { AnimatedGroup } from "@/components/animated-group";

const points = [
  {
    icon: Building2,
    title: "Self-hosted in your infrastructure",
    body: "CodeForge runs as its own deployment on servers you control, not a shared multi-tenant SaaS.",
  },
  {
    icon: Lock,
    title: "No candidate data leaves your environment",
    body: "Submissions, proctoring events, and results stay in your own database from day one.",
  },
  {
    icon: Palette,
    title: "White-label per client",
    body: "Your logo, colors, and name appear everywhere candidates and recruiters look.",
  },
  {
    icon: ListChecks,
    title: "Six real assessment types",
    body: "DSA, MCQ, frontend UI, bug fix, API challenges, and full repo projects, not just quizzes.",
  },
];

export function WhySelfHostedSection() {
  return (
    <section id="why-self-hosted" className="bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            Why teams choose to self-host
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Assessment data is some of the most sensitive data in your hiring pipeline. Self-hosting
            keeps it under your own control.
          </p>
        </div>

        <AnimatedGroup className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {points.map((p) => (
            <div key={p.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <p.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{p.body}</p>
            </div>
          ))}
        </AnimatedGroup>
      </div>
    </section>
  );
}
