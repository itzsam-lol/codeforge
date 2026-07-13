import { AnimatedGroup } from "@/components/animated-group";

const steps = [
  {
    step: "01",
    title: "We provision your deployment",
    body: "A dedicated instance is set up on your infrastructure or a server of your choosing, with your own database and domain.",
  },
  {
    step: "02",
    title: "You set your branding",
    body: "Logo, accent color, name, and support contact are configured once and applied across every recruiter and candidate screen.",
  },
  {
    step: "03",
    title: "Build your question bank",
    body: "Author or import DSA, MCQ, frontend, bug fix, API, and repo-project questions, then assemble them into timed tests.",
  },
  {
    step: "04",
    title: "Invite candidates and review results",
    body: "Send invitation links, watch sessions in progress, and review scored, proctored results as a team.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            From provisioning to your first invited candidate, without a self-serve signup flow to
            get in the way.
          </p>
        </div>

        <AnimatedGroup className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-2">
          {steps.map((s) => (
            <div key={s.step} className="flex gap-4">
              <span className="text-2xl font-semibold text-accent/40">{s.step}</span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{s.body}</p>
              </div>
            </div>
          ))}
        </AnimatedGroup>
      </div>
    </section>
  );
}
