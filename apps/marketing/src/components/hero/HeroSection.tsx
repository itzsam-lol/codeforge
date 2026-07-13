import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedGroup } from "@/components/animated-group";
import { HeroHeader } from "@/components/header/HeroHeader";
import type { Variants } from "framer-motion";

const itemVariants: Variants = {
  hidden: { opacity: 0, filter: "blur(12px)", y: 12 },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: { type: "spring", bounce: 0.3, duration: 1.5 },
  },
};

export function HeroSection() {
  return (
    <>
      <HeroHeader />
      <main className="overflow-hidden">
        <section className="cf-hero-mesh relative">
          <div className="relative pt-32 pb-20 md:pt-44 md:pb-32">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,rgba(5,7,15,0.4)_75%)]"
            />
            <div className="mx-auto max-w-7xl px-6">
              <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                <AnimatedGroup variants={{ item: itemVariants }}>
                  <span className="mx-auto flex w-fit items-center gap-3 rounded-full border border-white/10 bg-white/5 p-1 pl-4 text-sm text-slate-200 shadow-md backdrop-blur">
                    Now supporting six assessment types
                    <span className="block h-4 w-px bg-white/20" />
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                      <ArrowRight className="m-auto size-3" />
                    </span>
                  </span>

                  <h1 className="mx-auto mt-8 max-w-4xl text-balance text-5xl font-semibold tracking-tight text-white md:text-6xl lg:mt-12 lg:text-7xl">
                    Technical assessments your team fully controls
                  </h1>
                  <p className="mx-auto mt-8 max-w-2xl text-balance text-lg text-slate-300">
                    Self-hosted, white-label hiring assessments: DSA, system design, and real-world
                    coding challenges, deployed entirely in your own infrastructure. Your candidate
                    data never leaves your environment.
                  </p>
                </AnimatedGroup>

                <AnimatedGroup className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button href="mailto:support@codeforge.io?subject=Book%20a%20demo" size="lg">
                    Book a demo
                  </Button>
                  <Button
                    href="mailto:support@codeforge.io?subject=Contact%20sales"
                    variant="ghost"
                    size="lg"
                    className="text-slate-200 hover:bg-white/10 hover:text-white"
                  >
                    Contact sales
                  </Button>
                </AnimatedGroup>
              </div>
            </div>

            <AnimatedGroup>
              <div className="relative mt-16 overflow-hidden px-2 sm:mt-20 md:mt-24">
                <div className="mx-auto max-w-6xl">
                  {/* Placeholder for a future real Playwright capture of the
                      redesigned recruiter dashboard; swap src for a real
                      screenshot once that redesign lands. */}
                  <div className="cf-fade-mask-b relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3 shadow-2xl shadow-black/40 backdrop-blur">
                    <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900/60 p-6">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/60" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
                        <span className="ml-4 text-xs text-slate-400">Dashboard preview</span>
                      </div>
                      <div className="mt-6 grid grid-cols-4 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="h-16 rounded-lg bg-white/5" />
                        ))}
                      </div>
                      <div className="mt-4 space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="h-6 rounded bg-white/5" style={{ width: `${92 - i * 8}%` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </AnimatedGroup>
          </div>
        </section>
      </main>
    </>
  );
}
