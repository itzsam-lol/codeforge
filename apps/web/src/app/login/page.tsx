"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login, ApiError } from "@/lib/api";
import { Button, Card, ErrorNote, Field, Input } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { usePublicBranding } from "@/lib/branding";

export default function LoginPage() {
  const router = useRouter();
  const branding = usePublicBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  const accentStyle: CSSProperties | undefined = branding.accentColor
    ? ({
        "--color-accent": branding.accentColor,
        "--color-accent-hover": branding.accentColorHover ?? branding.accentColor,
      } as CSSProperties)
    : undefined;

  return (
    <main
      data-theme="recruiter"
      style={accentStyle}
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-surface via-accent/5 to-surface-container p-4"
    >
      <Card className="cf-rise w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <Wordmark branding={branding} />
          <p className="mt-1 text-sm text-on-surface-variant">{branding.tagline || "Recruiter sign in"}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error ? <ErrorNote message={error} /> : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
