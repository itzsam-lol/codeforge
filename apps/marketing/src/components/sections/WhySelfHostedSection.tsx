import { Building2, Lock, Palette, ListChecks } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { RevealGroup } from "@/components/Reveal";

const points = [
  {
    icon: Building2,
    title: "Self-hosted in your infrastructure",
    body: "CodeForge runs as its own deployment on servers you control, not a shared multi-tenant SaaS. One organization per install, by design.",
  },
  {
    icon: Lock,
    title: "No candidate data leaves your environment",
    body: "Submissions, proctoring events, and results stay in your own database from day one. Nothing is phoned home to a vendor.",
  },
  {
    icon: Palette,
    title: "White-label, end to end",
    body: "Your logo, accent color, and name appear everywhere candidates and recruiters look. A toggle hides every trace of CodeForge.",
  },
  {
    icon: ListChecks,
    title: "Six real assessment types",
    body: "DSA, MCQ, frontend UI, bug fix, API challenges, and full repo projects. Real engineering work, not multiple-choice trivia.",
  },
];

export function WhySelfHostedSection() {
  return (
    <section id="why-self-hosted" className="relative bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Why self-host"
          title="Your hiring data stays yours"
          subtitle="Assessment data is some of the most sensitive information in your pipeline. Self-hosting keeps it under your own control, on infrastructure you already trust."
        />

        <RevealGroup className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {points.map((p) => (
            <div
              key={p.title}
              className="h-full rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-8px_rgba(15,23,42,0.10)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_18px_36px_-10px_rgba(109,91,255,0.20)]"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <p.icon className="size-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{p.body}</p>
            </div>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
