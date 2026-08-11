import { ShieldCheck, Network, Fingerprint, FileLock2, Eye, ScanLine } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { RevealGroup, Reveal } from "@/components/Reveal";

const cards = [
  {
    icon: Network,
    title: "Sandboxed execution",
    body: "Candidate code never runs in the app process. Every submission executes inside an isolate sandbox with CPU, memory, and process limits and no network access.",
    span: "md:col-span-2",
  },
  {
    icon: Fingerprint,
    title: "Segmented networks",
    body: "The grading pool sits on its own network segment with no route to your application database, Redis, or secrets.",
    span: "",
  },
  {
    icon: Eye,
    title: "Server-authoritative scoring",
    body: "Scores, verdicts, and the exam clock are computed server-side. A tampered client cannot change a result.",
    span: "",
  },
  {
    icon: ScanLine,
    title: "Proctoring and plagiarism",
    body: "Configurable tab-switch and fullscreen enforcement, webcam checks, keystroke replay, and code-similarity detection across the cohort.",
    span: "md:col-span-2",
  },
  {
    icon: FileLock2,
    title: "Short-lived media access",
    body: "Webcam snapshots live in private object storage, served only through expiring signed URLs, with a configurable retention sweep.",
    span: "md:col-span-2",
  },
  {
    icon: ShieldCheck,
    title: "Auditable by design",
    body: "Every sensitive staff action is written to an append-only audit log your team can review.",
    span: "",
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="cf-hero-mesh relative overflow-hidden py-20 md:py-28">
      <div aria-hidden className="cf-grid cf-radial-mask pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Security model"
          tone="dark"
          title="Untrusted code, run safely"
          subtitle="Candidates run real programs against your assessments. Every layer of the platform is built to contain that, so their code can never reach what matters."
        />

        <RevealGroup className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.title}
              className={`rounded-2xl bg-white/[0.04] p-6 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/[0.08] ${c.span}`}
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-accent/20 text-accent-soft">
                <c.icon className="size-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">{c.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{c.body}</p>
            </div>
          ))}
        </RevealGroup>

        <Reveal className="mt-10 text-center" delay={0.1}>
          <a
            href="/contact?intent=sales"
            className="inline-flex items-center gap-2 text-sm font-medium text-accent-soft transition-colors hover:text-white"
          >
            Ask us about the full security model
            <span aria-hidden>&rarr;</span>
          </a>
        </Reveal>
      </div>
    </section>
  );
}
