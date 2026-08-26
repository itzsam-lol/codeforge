"use client";

/**
 * Pre-session informed-consent step, ported from apps/web's
 * candidate/EnvCheck.tsx: explain WHY each permission is needed before the
 * browser prompt fires, show a live preview once granted, and treat denial
 * as a handled state rather than a silent failure. Trimmed to Arena's
 * scope (no hardware-integrity heuristics — those are a client-product-
 * specific system this build doesn't replicate).
 */
import { useState } from "react";
import { Check, X } from "lucide-react";
import { useArenaWebcam, requestFullscreen, type ArenaProctoringLevel } from "@/lib/arenaProctoring";
import { cn } from "@/lib/utils";

interface CheckRow {
  label: string;
  why: string;
  required: boolean;
}

export function EnvCheck({
  level,
  webcamRequired,
  fullscreenRequired,
  onReady,
}: {
  level: ArenaProctoringLevel;
  webcamRequired: boolean;
  fullscreenRequired: boolean;
  onReady: () => void;
}) {
  const [webcamDenied, setWebcamDenied] = useState(false);
  const { videoRef, active: webcamActive } = useArenaWebcam({
    enabled: webcamRequired,
    onDenied: () => setWebcamDenied(true),
  });
  const [fullscreenEntered, setFullscreenEntered] = useState(
    typeof document !== "undefined" ? Boolean(document.fullscreenElement) : false
  );

  const rows: (CheckRow & { pass: boolean })[] = [
    {
      label: "Tab-switch & copy/paste detection",
      why:
        level === "strict" || level === "lockdown"
          ? "This contest blocks copy/paste in the editor and flags leaving the tab. Purely browser-side — no software installed."
          : "This contest flags leaving the tab. Purely browser-side — no software installed.",
      required: true,
      pass: true,
    },
    ...(fullscreenRequired
      ? [
          {
            label: "Fullscreen mode",
            why: "This contest runs in fullscreen; exiting is detected and shown to you live.",
            required: true,
            pass: fullscreenEntered,
          },
        ]
      : []),
    ...(webcamRequired
      ? [
          {
            label: "Camera",
            why: "A live preview only, shown to you — nothing is uploaded or recorded in this demo/practice flow.",
            required: true,
            pass: webcamActive && !webcamDenied,
          },
        ]
      : []),
  ];

  const ready = rows.every((r) => r.pass);

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-semibold text-white">Before you start</h2>
      <p className="mt-1 text-sm text-slate-400">
        Proctoring level: <span className="font-medium text-accent-soft">{level}</span>. Here&apos;s exactly what
        that means and why:
      </p>

      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-3 rounded-lg bg-white/5 px-3 py-2.5">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white",
                row.pass ? "bg-emerald-500" : "bg-white/20"
              )}
            >
              {row.pass ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
            </span>
            <div>
              <div className="text-sm font-medium text-white">{row.label}</div>
              <div className="text-xs text-slate-400">{row.why}</div>
            </div>
          </div>
        ))}
      </div>

      {webcamRequired ? (
        <div className="mt-4">
          <video ref={videoRef} muted playsInline className="h-36 w-full rounded-lg bg-black object-cover" />
          {webcamDenied ? (
            <p className="mt-2 text-xs text-rose-400">
              Camera access was denied. Allow it in your browser's site settings and reload this page.
            </p>
          ) : null}
        </div>
      ) : null}

      {fullscreenRequired && !fullscreenEntered ? (
        <button
          onClick={() => {
            void requestFullscreen().then(() => setFullscreenEntered(true));
          }}
          className="mt-4 w-full rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15"
        >
          Enter fullscreen
        </button>
      ) : null}

      <button
        disabled={!ready}
        onClick={onReady}
        className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {ready ? "Continue" : "Complete the checks above"}
      </button>
    </div>
  );
}
