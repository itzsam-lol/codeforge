import { Code2, ListChecks, LayoutPanelLeft, Bug, Server, GitBranch, ShieldCheck, Palette } from "lucide-react";
import { AnimatedGroup } from "@/components/animated-group";

const features = [
  { icon: Code2, title: "DSA / Coding", body: "Algorithmic problems graded against hidden test cases in a sandboxed execution runtime." },
  { icon: ListChecks, title: "MCQ / MSQ", body: "Single and multi-select questions for concept checks and screening rounds." },
  { icon: LayoutPanelLeft, title: "Frontend UI", body: "Candidates write HTML, CSS, and JS, graded by rendering and comparing against a reference design." },
  { icon: Bug, title: "Bug Fix", body: "Candidates patch a broken starter project against a hidden test suite." },
  { icon: Server, title: "API / Backend Challenge", body: "A candidate's server runs in an isolated container and is exercised by scripted HTTP tests." },
  { icon: GitBranch, title: "Repo Project", body: "Candidates submit a repository URL; clone, install, build, and test run in a sandboxed pipeline." },
  { icon: ShieldCheck, title: "Proctoring and integrity", body: "Configurable tab-switch and fullscreen enforcement, webcam checks, and plagiarism detection." },
  { icon: Palette, title: "White-label branding", body: "Your logo, accent color, and name applied across the recruiter dashboard and candidate flow." },
];

export function FeaturesSection() {
  return (
    <section id="features" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            One platform, six real assessment types
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Built for engineering hiring specifically, not adapted from a generic quiz tool.
          </p>
        </div>

        <AnimatedGroup className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </AnimatedGroup>
      </div>
    </section>
  );
}
