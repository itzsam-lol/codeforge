"use client";

import { useEffect, useRef, useState } from "react";
import { fmtCountdown } from "@/lib/format";
import { cn } from "@/components/ui";

/**
 * Countdown synced to the SERVER clock: remaining time is computed against
 * the server-issued deadline plus a measured client/server offset, so local
 * clock tampering only changes what's displayed, never the real deadline
 * (which a server-side job enforces regardless).
 */
export function Timer({
  endsAtMs,
  offsetMs,
  onExpire,
}: {
  endsAtMs: number;
  offsetMs: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.floor((endsAtMs - (Date.now() + offsetMs)) / 1000)
  );
  const expiredRef = useRef(false);
  // Announce the 5-minute threshold once, not every tick — a live region
  // that updates every second would be unusable noise for a screen reader.
  const [announceLow, setAnnounceLow] = useState(false);
  const announcedLowRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const secs = Math.floor((endsAtMs - (Date.now() + offsetMs)) / 1000);
      setRemaining(secs);
      if (secs <= 300 && !announcedLowRef.current) {
        announcedLowRef.current = true;
        setAnnounceLow(true);
      }
      if (secs <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAtMs, offsetMs, onExpire]);

  const low = remaining <= 300; // last 5 minutes
  const critical = remaining <= 120; // last 2 minutes
  return (
    <>
      <span
        className={cn(
          "rounded-lg px-2.5 py-1 font-mono text-sm font-semibold tabular-nums",
          low ? "bg-bad-bg text-bad" : "bg-surface-container-high text-on-surface-variant",
          critical ? "animate-pulse" : ""
        )}
        title="Time remaining (server-enforced)"
      >
        {fmtCountdown(remaining)}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {announceLow ? "5 minutes remaining." : ""}
      </span>
    </>
  );
}
