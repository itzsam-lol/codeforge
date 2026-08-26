"use client";

import { Camera, Shield, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChosenLevel = "none" | "webcam" | "lockdown";

const TIERS: { level: ChosenLevel; label: string; icon: typeof User; description: string }[] = [
  { level: "none", label: "Casual", icon: User, description: "Just code. No monitoring." },
  { level: "webcam", label: "Verified", icon: Camera, description: "Webcam preview + snapshot checks. Earn the Verified Competitor badge." },
  { level: "lockdown", label: "Hardcore", icon: Shield, description: "Full monitoring: webcam, fullscreen, copy/paste blocking. Earn Sentinel Survivor." },
];

export function ProctoringLobby({
  webcamBonusPct,
  lockdownBonusPct,
  onChoose,
  submitting,
}: {
  webcamBonusPct: number;
  lockdownBonusPct: number;
  onChoose: (level: ChosenLevel) => void;
  submitting: boolean;
}) {
  const bonusFor = (level: ChosenLevel) => (level === "webcam" ? webcamBonusPct : level === "lockdown" ? lockdownBonusPct : 0);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-center text-3xl font-semibold text-white">Choose your proctoring level</h1>
      <p className="mx-auto mt-2 max-w-lg text-center text-sm text-slate-400">
        This is genuinely real proctoring, not cosmetic — the more you opt into, the more your rating swings on this
        contest, up or down. Locked in once you submit your first answer.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TIERS.map((t) => {
          const bonus = bonusFor(t.level);
          return (
            <button
              key={t.level}
              disabled={submitting}
              onClick={() => onChoose(t.level)}
              className={cn(
                "flex flex-col items-center rounded-2xl border border-white/10 bg-white/5 p-6 text-center transition duration-200",
                "hover:-translate-y-1 hover:border-accent/50 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <t.icon className="size-8 text-accent-soft" />
              <h3 className="mt-3 font-semibold text-white">{t.label}</h3>
              <p className="mt-2 text-xs text-slate-400">{t.description}</p>
              <span className="mt-4 rounded-full bg-accent/15 px-3 py-1 text-sm font-bold text-accent-soft">
                {bonus > 0 ? `${bonus}% rating multiplier` : "1x rating"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
