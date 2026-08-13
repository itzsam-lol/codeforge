import type { Metadata } from "next";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <Wordmark />
      <p className="mt-8 text-sm font-medium uppercase tracking-wide text-accent">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">Page not found</h1>
      <p className="mt-3 max-w-sm text-sm text-slate-600">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Button href="/" className="mt-8">
        Back to home
      </Button>
    </main>
  );
}
