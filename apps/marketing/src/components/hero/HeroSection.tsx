"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { HeroHeader } from "@/components/header/HeroHeader";
import { ProductMock } from "@/components/ProductMock";

const heroStats = [
  { value: "6", label: "Assessment formats" },
  { value: "8", label: "Languages sandboxed" },
  { value: "100%", label: "Self-hosted" },
  { value: "0", label: "Records leave your VPC" },
];

export function HeroSection() {
  const reduce = useReducedMotion();

  return (
    <>
      <HeroHeader />
      <main className="cf-hero-mesh relative overflow-hidden">
        {/* grid overlay: the one deliberate background treatment for this page */}
        <div aria-hidden className="cf-grid cf-radial-mask pointer-events-none absolute inset-0 -z-0" />

        <section className="relative">
          <div className="relative px-6 pt-32 pb-20 md:pt-44 md:pb-28">
            <div className="mx-auto max-w-4xl text-center">
              <motion.a
                href="#features"
                initial={reduce ? false : { opacity: 0, y: 12, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="group mx-auto flex w-fit items-center gap-3 rounded-full border border-white/10 bg-white/5 p-1 pl-4 text-sm text-slate-200 shadow-md backdrop-blur transition-colors hover:border-white/20"
              >
                <span className="relative flex size-2">
                  <span className="cf-blink absolute inline-flex size-2 rounded-full bg-emerald-400" />
                </span>
                Now supporting six assessment types
                <span className="block h-4 w-px bg-white/20" />
                <span className="flex size-6 items-center justify-center overflow-hidden rounded-full bg-white/10">
                  <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-4" />
                  <ArrowRight className="absolute size-3 -translate-x-4 transition-transform duration-300 group-hover:translate-x-0" />
                </span>
              </motion.a>

              <motion.h1
                initial={reduce ? false : { opacity: 0, y: 16, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto mt-8 max-w-4xl text-balance text-5xl font-semibold tracking-tight md:text-6xl lg:mt-12 lg:text-7xl"
              >
                <span className="text-white">Technical assessments </span>
                <span className="text-accent-soft">your team fully controls</span>
              </motion.h1>

              <motion.p
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.25 }}
                className="mx-auto mt-7 max-w-2xl text-balance text-lg text-slate-300"
              >
                Self-hosted, white-label hiring assessments: DSA, system design, and real-world
                coding challenges, deployed entirely in your own infrastructure. Your candidate
                data never leaves your environment.
              </motion.p>

              <motion.div
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <Button href="mailto:support@codeforge.io?subject=Book%20a%20demo" size="lg" className="w-full sm:w-auto">
                  Book a demo
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  href="mailto:support@codeforge.io?subject=Contact%20sales"
                  variant="glass"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  Contact sales
                </Button>
              </motion.div>

              <motion.p
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.55 }}
                className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-400"
              >
                <ShieldCheck className="size-4 text-emerald-400" />
                No self-serve signup. Deployed and configured with you.
              </motion.p>
            </div>

            {/* product mock */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto mt-16 max-w-5xl md:mt-20"
            >
              <div className="absolute -inset-x-8 -top-8 bottom-0 -z-10 rounded-[2rem] bg-accent/10 blur-2xl" />
              <ProductMock />
            </motion.div>

            {/* stat strip */}
            <motion.dl
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 sm:grid-cols-4"
            >
              {heroStats.map((s) => (
                <div key={s.label} className="bg-[#05070f]/40 px-6 py-5 text-center backdrop-blur">
                  <dt className="text-3xl font-semibold text-white">{s.value}</dt>
                  <dd className="mt-1 text-xs text-slate-400">{s.label}</dd>
                </div>
              ))}
            </motion.dl>
          </div>
        </section>
      </main>
    </>
  );
}
