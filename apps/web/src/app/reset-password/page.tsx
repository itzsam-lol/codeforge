"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, ErrorNote, Field, Input } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { usePublicBranding } from "@/lib/branding";

function ResetPasswordForm() {
  const router = useRouter();
  const branding = usePublicBranding();
  const token = useSearchParams().get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) return setError("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return setError("Passwords don't match");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "This reset link is invalid or has expired");
      }
      setDone(true);
      setTimeout(() => router.replace("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
          <p className="mt-1 text-sm text-on-surface-variant">Set a new password</p>
        </div>
        {!token ? (
          <ErrorNote message="This reset link is missing its token. Request a new one from the login page." />
        ) : done ? (
          <p className="text-center text-sm text-on-surface-variant">
            Password changed. Redirecting to sign in…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="New password" hint="At least 8 characters">
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            {error ? <ErrorNote message={error} /> : null}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Saving…" : "Set new password"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
