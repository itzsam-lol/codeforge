"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, ErrorNote, Field, Input } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { usePublicBranding } from "@/lib/branding";

export default function ForgotPasswordPage() {
  const branding = usePublicBranding();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      data-theme="recruiter"
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-surface via-accent/5 to-surface-container p-4"
    >
      <Card className="cf-rise w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <Wordmark branding={branding} />
          <p className="mt-1 text-sm text-on-surface-variant">Reset your password</p>
        </div>
        {sent ? (
          <p className="text-center text-sm text-on-surface-variant">
            If an account exists for that email, we've sent a link to reset your password. It
            expires in 1 hour.
          </p>
        ) : (
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
            {error ? <ErrorNote message={error} /> : null}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <a href="/login" className="mt-6 block text-center text-xs font-medium text-accent hover:text-accent-hover">
          Back to sign in
        </a>
      </Card>
    </main>
  );
}
