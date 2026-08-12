"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, ErrorNote, Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
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
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-headline-md text-on-surface">Reset your password</h1>
        <p className="mt-1 text-sm text-on-surface-variant">CodeForge HQ</p>
        {sent ? (
          <p className="mt-6 text-sm text-on-surface-variant">
            If an account exists for that email, we've sent a link to reset your password. It
            expires in 1 hour.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Email">
              <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
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
    </div>
  );
}
