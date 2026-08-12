import { ArrowRight, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/Reveal";

export function CTASection() {
  return (
    <section id="contact" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <Reveal>
          <div className="cf-hero-mesh relative overflow-hidden rounded-[2rem] px-8 py-16 text-center shadow-[0_24px_64px_-16px_rgba(5,7,15,0.45)] md:px-12 md:py-20">
            <div aria-hidden className="cf-grid cf-radial-mask pointer-events-none absolute inset-0" />

            <div className="relative">
              <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-accent-soft">
                <CalendarClock className="size-4" />
                30-minute walkthrough
              </span>
              <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
                See CodeForge running on your own infrastructure
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-slate-300">
                Book a short demo and we will walk through a deployment tailored to your hiring
                process, your stack, and your brand.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button href="/contact?intent=demo" size="lg" className="w-full sm:w-auto">
                  Book a demo
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  href="/contact?intent=sales"
                  variant="glass"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  Contact sales
                </Button>
              </div>
              <p className="mt-6 text-sm text-slate-400">
                Prefer email? Reach us at{" "}
                <a href="mailto:support@codeforge.io" className="font-medium text-accent-soft hover:text-white">
                  support@codeforge.io
                </a>
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
