import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui";
import { IconSearch } from "@/components/icons";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false, nocache: true },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
        <IconSearch size={24} />
      </div>
      <p className="mt-6 text-label-caps text-accent">404</p>
      <h1 className="mt-2 text-headline-md text-on-surface">Page not found</h1>
      <p className="mt-2 max-w-sm text-body-md text-on-surface-variant">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link href="/dashboard" className="mt-6">
        <Button>Back to dashboard</Button>
      </Link>
    </main>
  );
}
