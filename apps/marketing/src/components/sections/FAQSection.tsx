"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "Where does the platform actually run?",
    a: "On infrastructure you control. CodeForge ships as one self-hosted deployment per client, with its own database, object storage, and domain. It is not a shared multi-tenant SaaS, so your data never sits alongside another company's.",
  },
  {
    q: "How is candidate code executed safely?",
    a: "Submissions run in a sandboxed execution runtime with network access disabled by default. Repo-project grading runs in an isolated pipeline behind an egress allowlist, so untrusted candidate code cannot reach the open internet or your internal services.",
  },
  {
    q: "Can we fully white-label it?",
    a: "Yes. Logo, accent color, display name, favicon, and support contact are configured once and applied across the recruiter dashboard and the entire candidate flow. A single toggle hides every trace of CodeForge branding so it reads as your own product.",
  },
  {
    q: "Which languages are supported for coding questions?",
    a: "JavaScript, TypeScript, Python, C++, C, Java, C#, and Go, each with its own sandbox configuration. MCQ, frontend, bug-fix, API, and repo-project types layer on top of that for full engineering coverage.",
  },
  {
    q: "How do you handle integrity and proctoring?",
    a: "Configurable tab-switch and fullscreen enforcement, webcam checks, keystroke replay, and a plagiarism engine that compares submissions against a per-question corpus. Every proctoring behavior is disclosed to candidates up front, by design.",
  },
  {
    q: "Is there a signup or billing flow?",
    a: "No. Onboarding is a provisioning and configuration process we run with you, not a self-serve checkout. Commercial terms are handled per client rather than enforced inside the running application.",
  },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-slate-200">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-base font-medium text-slate-900 md:text-lg">{q}</span>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition-all duration-300",
            open && "rotate-45 border-accent bg-accent text-white"
          )}
        >
          <Plus className="size-4" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-5 pr-12 text-sm leading-relaxed text-slate-600">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions, answered"
          subtitle="The details teams ask about most before deploying."
        />
        <div className="mt-12">
          {faqs.map((f, i) => (
            <FaqItem
              key={f.q}
              q={f.q}
              a={f.a}
              open={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
