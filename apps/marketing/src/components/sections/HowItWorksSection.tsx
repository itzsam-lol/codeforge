"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ServerCog, Palette, Library, Send } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";

const steps = [
  {
    icon: ServerCog,
    title: "We provision your deployment",
    body: "A dedicated instance is stood up on your infrastructure or a server you choose, with your own database, object storage, and domain.",
  },
  {
    icon: Palette,
    title: "You set your branding",
    body: "Logo, accent color, name, and support contact are configured once and applied across every recruiter and candidate screen.",
  },
  {
    icon: Library,
    title: "Build your question bank",
    body: "Author or import DSA, MCQ, frontend, bug-fix, API, and repo-project questions, then assemble them into timed tests.",
  },
  {
    icon: Send,
    title: "Invite candidates and review",
    body: "Send invitation links, watch sessions in progress, and review scored, proctored results together as a hiring team.",
  },
];

export function HowItWorksSection() {
  const reduce = useReducedMotion();

  return (
    <section id="how-it-works" className="relative bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="How it works"
          title="From zero to first candidate"
          subtitle="No self-serve signup flow to fight through. We deploy and configure the platform with you, then hand you the keys."
        />

        <div className="relative mx-auto mt-16 max-w-2xl">
          {/* animated vertical spine */}
          <div aria-hidden className="absolute left-[26px] top-2 bottom-2 w-px bg-slate-200 md:left-[31px]">
            <motion.div
              initial={reduce ? false : { scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
              style={{ transformOrigin: "top" }}
              className="h-full w-px bg-gradient-to-b from-accent via-accent to-transparent"
            />
          </div>

          <ol className="space-y-10">
            {steps.map((s, i) => (
              <motion.li
                key={s.title}
                initial={reduce ? false : { opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="relative flex gap-6"
              >
                <div className="relative z-10 flex size-[54px] shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-accent shadow-sm md:size-16">
                  <s.icon className="size-6" />
                  <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white shadow">
                    {i + 1}
                  </span>
                </div>
                <div className="pt-1.5">
                  <h3 className="text-lg font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
