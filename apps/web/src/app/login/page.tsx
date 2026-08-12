"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login, verifyTwoFactor, ApiError } from "@/lib/api";
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

  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(email, password);
      if (result.twoFactorRequired) {
        setChallengeToken(result.challengeToken);
        setBusy(false);
        return;
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyTwoFactor(challengeToken!, code.trim());
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
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
          <p className="mt-1 text-sm text-on-surface-variant">
            {challengeToken ? "Enter your two-factor code" : branding.tagline || "Recruiter sign in"}
          </p>
        </div>
        {challengeToken ? (
          <form onSubmit={onVerify} className="space-y-4">
            <Field label="Authentication code" hint="From your authenticator app, or a backup code">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                autoFocus
                autoComplete="one-time-code"
                required
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
    </main>
  );
}
