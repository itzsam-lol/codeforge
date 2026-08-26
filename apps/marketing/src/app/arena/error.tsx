"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * FEAT-16: dark-themed error boundary for everything under /arena — without
 * this, an uncaught render error here would fall through to the root
 * app/error.tsx, which is styled for the light-mode marketing site
 * (bg-white/text-slate-900) and looks broken against Arena's dark UI.
 * Mirrors arena/not-found.tsx's existing dark-theme precedent.
 */
export default function ArenaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
        <AlertTriangle className="size-6" />
      </div>
      <h1 className="mt-6 text-3xl font-semibold text-white">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-400">
        An unexpected error occurred loading this page. Try again, or head back to Arena.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button href="/arena">Back to Arena</Button>
      </div>
    </section>
  );
}
