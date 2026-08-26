import Link from "next/link";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ArenaNotFound() {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent-soft">
        <Trophy className="size-6" />
      </div>
      <h1 className="mt-6 text-3xl font-semibold text-white">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-400">
        This page doesn&apos;t exist, or the contest/problem/profile you&apos;re looking for isn&apos;t here anymore.
      </p>
      <Button href="/arena" size="lg" className="mt-6">
        Back to Arena
      </Button>
      <Link href="/" className="mt-3 text-xs text-slate-500 hover:text-slate-300">
        Or go to the CodeForge homepage
      </Link>
    </section>
  );
}
