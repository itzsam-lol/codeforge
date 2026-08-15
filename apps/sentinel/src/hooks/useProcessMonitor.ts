import { useEffect, useRef, useState } from "react";
import { getBlacklistViolations, onViolation, type Violation } from "@/lib/tauri";

/**
 * Subscribes to the Rust watchdog's live violation feed (services/watchdog.rs),
 * seeded with whatever it already recorded before this component mounted.
 */
export function useProcessMonitor() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getBlacklistViolations()
      .then((existing) => {
        if (mounted.current) setViolations(existing);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));

    const unlistenPromise = onViolation((violation) => {
      if (!mounted.current) return;
      setViolations((prev) => [...prev, violation]);
    });

    return () => {
      mounted.current = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const hardViolations = violations.filter((v) => v.severity === "hard");

  return { violations, hardViolations, error };
}
