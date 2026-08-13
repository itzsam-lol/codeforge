"use client";

import { useEffect } from "react";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <Wordmark />
      <h1 className="mt-8 text-2xl font-semibold text-slate-900 md:text-3xl">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-sm text-slate-600">
        An unexpected error occurred. Try again, or head back to the homepage.
      </p>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button href="/">Back to home</Button>
      </div>
    </main>
  );
}
