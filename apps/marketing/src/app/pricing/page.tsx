import type { Metadata } from "next";
import { Building2, MessageSquareText, ServerCog, Users } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { SectionHeading } from "@/components/SectionHeading";
import { RevealGroup } from "@/components/Reveal";
import { Button } from "@/components/ui/button";

const TITLE = "Pricing";
const DESCRIPTION = "How CodeForge pricing works: per-deployment, sales-led, no self-serve tiers.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};

const FACTORS = [
  {
    icon: Users,
    title: "Team size",
    body: "How many recruiters and reviewers need seats on the dashboard, and how many candidates you expect to run through it.",
  },
  {
    icon: ServerCog,
    title: "Deployment complexity",
    body: "A single self-hosted instance on infrastructure you already run versus one we help provision and manage for you.",
  },
  {
    icon: Building2,
    title: "White-labeling",
    body: "Whether the platform needs to read as entirely your own product — logo, accent color, domain, every trace of CodeForge branding hidden.",
  },
  {
    icon: MessageSquareText,
    title: "Support & rollout",
    body: "How much hands-on help you want standing up your question bank, proctoring configuration, and integrations.",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 pt-10">
        <a href="/" aria-label="CodeForge home" className="flex items-center">
          <Wordmark dark={false} />
        </a>
      </div>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-6">
          <SectionHeading
            eyebrow="Pricing"
            title="Priced per deployment, not per seat"
            subtitle="CodeForge doesn't have public self-serve tiers. Every deployment is self-hosted and configured with you, so pricing reflects your actual setup rather than a one-size-fits-all plan."
          />
        </div>

        <RevealGroup className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-5 px-6 sm:grid-cols-2">
          {FACTORS.map((f) => (
            <div
              key={f.title}
              className="h-full rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-8px_rgba(15,23,42,0.10)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_18px_36px_-10px_rgba(109,91,255,0.20)]"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </RevealGroup>

        <div className="mx-auto mt-14 max-w-2xl px-6">
          <div className="rounded-2xl bg-slate-50 p-6 md:p-8">
            <h3 className="text-lg font-semibold text-slate-900">Why there's no price list</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              CodeForge ships as one self-hosted deployment per client rather than a shared
              multi-tenant SaaS (see{" "}
              <a href="/#why-self-hosted" className="font-medium text-accent hover:underline">
                why we self-host
              </a>
              ). That means there&apos;s no fixed per-seat meter running inside the product to bill
              against — commercial terms are agreed with you directly, the same way they would be
              for any infrastructure you provision and run yourselves. A short call is the fastest
              way to get an actual number for your situation.
            </p>
          </div>
        </div>

        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-3 px-6 text-center sm:flex-row sm:justify-center sm:gap-4">
          <Button href="/contact?intent=sales" size="lg">
            Talk to sales
          </Button>
          <Button href="/contact?intent=demo" variant="outline" size="lg">
            Book a demo
          </Button>
        </div>
      </section>
    </main>
  );
}
