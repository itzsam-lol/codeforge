"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { IconAlert } from "@/components/icons";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bad-bg text-bad">
        <IconAlert size={24} />
      </div>
      <h1 className="mt-6 text-headline-md text-on-surface">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-body-md text-on-surface-variant">
        An unexpected error occurred. Try again, or head back to the dashboard.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
        <Link href="/dashboard">
          <Button>Back to dashboard</Button>
        </Link>
      </div>
    </main>
  );
}
