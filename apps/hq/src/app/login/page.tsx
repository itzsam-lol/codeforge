"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, verifyTwoFactor, ApiError } from "@/lib/api";
import { Button, Card, ErrorNote, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(email, password);
      if (result.twoFactorRequired) {
        setChallengeToken(result.challengeToken);
        return;
      }
      router.replace("/clients");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyTwoFactor(challengeToken!, code.trim());
      router.replace("/clients");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-headline-md text-on-surface">CodeForge HQ</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {challengeToken ? "Enter your two-factor code" : "Internal operations console"}
        </p>
        {challengeToken ? (
          <form onSubmit={onVerify} className="mt-6 space-y-4">
            <Field label="Authentication code" hint="From your authenticator app, or a backup code">
              <Input
                required
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
            </Field>
            {error ? <ErrorNote message={error} /> : null}
            <Button type="submit" disabled={busy || !code.trim()} className="w-full">
              {busy ? "Verifying…" : "Verify"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setChallengeToken(null);
                setCode("");
                setError(null);
              }}
              className="w-full text-center text-xs font-medium text-on-surface-variant hover:text-on-surface"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Email">
              <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <div className="text-right">
              <a href="/forgot-password" className="text-xs font-medium text-accent hover:text-accent-hover">
                Forgot password?
              </a>
            </div>
            {error ? <ErrorNote message={error} /> : null}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
