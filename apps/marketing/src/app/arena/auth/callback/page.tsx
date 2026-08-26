"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { arenaOAuthExchange } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useArenaAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      setError("Missing sign-in code");
      return;
    }
    arenaOAuthExchange(code)
      .then((user) => {
        setUser(user);
        router.replace("/arena");
      })
      .catch(() => setError("This sign-in link has expired, please try again"));
  }, [params, router, setUser]);

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-20 text-center">
      {error ? (
        <>
          <p className="text-sm text-rose-400">{error}</p>
          <a href="/arena/auth/login" className="mt-4 text-sm font-medium text-accent-soft hover:underline">
            Back to sign in
          </a>
        </>
      ) : (
        <>
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
          <p className="mt-4 text-sm text-slate-400">Finishing sign-in…</p>
        </>
      )}
    </section>
  );
}

export default function ArenaOAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
