"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Github, Chrome } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { ApiError, arenaLogin } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";

export default function ArenaLoginPage() {
  const router = useRouter();
  const { setUser } = useArenaAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await arenaLogin(email, password);
      setUser(user);
      router.push("/arena");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20">
      <Reveal>
        <h1 className="text-3xl font-semibold text-white">Sign in to Arena</h1>
        <p className="mt-2 text-sm text-slate-400">Compete in weekly contests and track your rating.</p>

        <div className="mt-8 flex flex-col gap-2.5">
          <a
            href="/api/arena/auth/google/start"
            className="flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <Chrome className="size-4" /> Continue with Google
          </a>
          <a
            href="/api/arena/auth/github/start"
            className="flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <Github className="size-4" /> Continue with GitHub
          </a>
        </div>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-white/10" />
          or
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
              placeholder="••••••••"
            />
          </div>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          New to Arena?{" "}
          <a href="/arena/auth/register" className="font-medium text-accent-soft hover:underline">
            Create an account
          </a>
        </p>
      </Reveal>
    </section>
  );
}
