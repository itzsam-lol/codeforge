"use client";

import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, Users, FileCheck2, ShieldCheck, Search } from "lucide-react";

/**
 * A stylized, self-contained mock of the recruiter dashboard, built from real
 * UI elements (stat cards, a candidate results table, status pills) rather
 * than a screenshot, so it stays crisp at any size and animates. Purely
 * decorative, hence aria-hidden.
 */
export function ProductMock() {
  const reduce = useReducedMotion();

  const rows = [
    { name: "Aarav Mehta", type: "DSA + System Design", score: 92, status: "Passed", tone: "emerald" },
    { name: "Chen Wei", type: "API Challenge", score: 78, status: "Review", tone: "amber" },
    { name: "Sofia Rossi", type: "Frontend UI", score: 88, status: "Passed", tone: "emerald" },
    { name: "James Okoro", type: "Bug Fix + MCQ", score: 64, status: "In progress", tone: "indigo" },
    { name: "Lena Fischer", type: "Repo Project", score: 81, status: "Passed", tone: "emerald" },
  ] as const;

  const toneClass: Record<string, string> = {
    emerald: "bg-emerald-500/15 text-emerald-300",
    amber: "bg-amber-500/15 text-amber-300",
    indigo: "bg-indigo-500/15 text-indigo-300",
  };

  return (
    <div aria-hidden className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e1f]/80 shadow-2xl shadow-black/50 backdrop-blur">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-rose-400/70" />
        <span className="h-3 w-3 rounded-full bg-amber-400/70" />
        <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
        <div className="ml-4 flex h-6 flex-1 items-center gap-2 rounded-md bg-white/5 px-2 text-[11px] text-slate-400">
          <Search className="size-3" />
          app.yourcompany.com/dashboard
        </div>
      </div>

      <div className="flex">
        {/* sidebar */}
        <div className="hidden w-40 shrink-0 flex-col gap-1 border-r border-white/10 p-3 sm:flex">
          {[
            { icon: LayoutGrid, label: "Dashboard", active: true },
            { icon: Users, label: "Candidates" },
            { icon: FileCheck2, label: "Tests" },
            { icon: ShieldCheck, label: "Integrity" },
          ].map((it) => (
            <div
              key={it.label}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs ${
                it.active ? "bg-accent/20 text-white" : "text-slate-400"
              }`}
            >
              <it.icon className="size-3.5" />
              {it.label}
            </div>
          ))}
        </div>

        {/* main */}
        <div className="min-w-0 flex-1 p-4">
          {/* stat cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Candidates", value: "1,284" },
              { label: "Avg. score", value: "76%" },
              { label: "Flagged", value: "3" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 + i * 0.1, duration: 0.5 }}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="text-[10px] uppercase tracking-wide text-slate-400">{s.label}</div>
                <div className="mt-1 text-lg font-semibold text-white">{s.value}</div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    initial={reduce ? false : { width: 0 }}
                    whileInView={{ width: `${55 + i * 15}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.8 }}
                    className="h-full rounded-full bg-accent"
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* results table */}
          <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-[1.4fr_1.4fr_0.6fr_0.9fr] gap-2 border-b border-white/10 bg-white/[0.02] px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500">
              <span>Candidate</span>
              <span>Assessment</span>
              <span>Score</span>
              <span>Status</span>
            </div>
            {rows.map((r, i) => (
              <motion.div
                key={r.name}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                className="grid grid-cols-[1.4fr_1.4fr_0.6fr_0.9fr] items-center gap-2 border-b border-white/5 px-3 py-2.5 text-xs last:border-0"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/25 text-[9px] font-semibold text-white">
                    {r.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                  <span className="truncate text-slate-200">{r.name}</span>
                </div>
                <span className="truncate text-slate-400">{r.type}</span>
                <span className="font-mono text-slate-200">{r.score}</span>
                <span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass[r.tone]}`}>
                    {r.status}
                  </span>
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
