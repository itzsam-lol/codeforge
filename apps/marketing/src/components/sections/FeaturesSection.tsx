import { BarChart3, Users2, ClipboardList, Mail, GitCompareArrows, Shuffle } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { RevealGroup } from "@/components/Reveal";

const capabilities = [
  {
    icon: BarChart3,
    title: "Cohort analytics",
    body: "Score distributions, per-question pass rates, and average completion time across every candidate in a round.",
  },
  {
    icon: Users2,
    title: "Team review workflow",
    body: "Reviewers score against shared rubrics, leave notes, shortlist, and tag candidates, with role-scoped access.",
  },
  {
    icon: GitCompareArrows,
    title: "Plagiarism detection",
    body: "Pairwise code-similarity scanning across the cohort, with a side-by-side diff view of matched ranges.",
  },
  {
    icon: Shuffle,
    title: "Question pools",
    body: "Randomize interchangeable questions per candidate to reduce answer-sharing across staggered start times.",
  },
  {
    icon: ClipboardList,
    title: "Exports and reports",
    body: "One-click CSV and PDF exports of results for offline review with a hiring panel.",
  },
  {
    icon: Mail,
    title: "Automated candidate email",
    body: "Invitations, reminders, and results-ready notifications, sent from your own domain.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Platform"
          title="Everything hiring teams need around the test"
          subtitle="The assessment is only half the job. CodeForge handles review, analytics, integrity, and communication too."
        />

        <RevealGroup className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((c) => (
            <div
              key={c.title}
              className="h-full rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-8px_rgba(15,23,42,0.10)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_18px_36px_-10px_rgba(109,91,255,0.20)]"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <c.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{c.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{c.body}</p>
            </div>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
