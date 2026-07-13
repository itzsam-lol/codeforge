"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { candidateApi, ApiError } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { Button, Card, ErrorNote, Field, Input, Spinner } from "@/components/ui";
import { TestRunner } from "@/components/candidate/TestRunner";
import { EnvCheck } from "@/components/candidate/EnvCheck";
import type { ProctoringConfig } from "@/lib/proctoring";
import { IconArrowRight, IconCheckCircle, IconClock, IconCode, IconList, IconLock } from "@/components/icons";
import { Wordmark } from "@/components/Wordmark";

interface CandidateContext {
  serverNow: string;
  org: {
    name: string;
    tagline: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
    accentColor: string | null;
    accentColorHover: string | null;
    supportEmail: string | null;
    privacyUrl: string | null;
    hideCodeForgeBranding: boolean;
  };
  test: {
    title: string;
    description: string;
    durationMinutes: number;
    instructionsMd: string;
    proctoringLevel: string;
    schedulingStart: string | null;
    schedulingEnd: string | null;
    status: string;
    questionCount: number;
  };
  proctoring: ProctoringConfig;
  invitation: {
    candidateName: string;
    candidateEmail: string;
    status: string;
    expiresAt: string;
  };
  session: {
    status: string;
    startedAt: string | null;
    endsAt: string | null;
    submittedAt: string | null;
  } | null;
}

type Phase = "loading" | "error" | "landing" | "envcheck" | "ready" | "test" | "done";

const NO_PROCTORING: ProctoringConfig = {
  level: "none",
  limits: {},
  webcamRequired: false,
  fullscreenRequired: false,
};

export default function CandidatePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [phase, setPhase] = useState<Phase>("loading");
  const [ctx, setCtx] = useState<CandidateContext | null>(null);
  const [fatal, setFatal] = useState<string>("");

  const loadContext = useCallback(async () => {
    try {
      const data = await candidateApi<CandidateContext>(token, "/api/candidate/context");
      setCtx(data);
      const s = data.session?.status;
      const proctored = (data.proctoring ?? NO_PROCTORING).level !== "none";
      if (s === "submitted" || s === "auto_submitted") setPhase("done");
      else if (s === "in_progress") setPhase("test");
      else if (s === "created") setPhase(proctored ? "envcheck" : "ready");
      else setPhase("landing");
    } catch (err) {
      setFatal(err instanceof ApiError ? err.message : "Could not load this test link.");
      setPhase("error");
    }
  }, [token]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  if (phase === "loading") return <Spinner label="Loading your test…" />;

  if (phase === "error") {
    return (
      <CandidateShell org={ctx?.org}>
        <Card className="cf-rise mx-auto max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
            <IconLock size={22} />
          </div>
          <h1 className="mt-3 text-headline-sm text-on-surface">This link isn&apos;t available</h1>
          <p className="mt-2 text-sm text-on-surface-variant">{fatal}</p>
        </Card>
      </CandidateShell>
    );
  }

  if (phase === "test") {
    return (
      <TestRunner
        token={token}
        proctoring={ctx?.proctoring ?? NO_PROCTORING}
        onFinished={() => setPhase("done")}
      />
    );
  }

  if (phase === "done") {
    return (
      <CandidateShell org={ctx?.org}>
        <Card className="cf-rise mx-auto max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <IconCheckCircle size={24} />
          </div>
          <h1 className="mt-3 text-headline-sm text-on-surface">Your test has been submitted</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Thanks, {ctx?.invitation.candidateName}. Your responses for
            {" "}<b>{ctx?.test.title}</b> are in. The hiring team will review them and get back to
            you, you can close this tab.
          </p>
        </Card>
      </CandidateShell>
    );
  }

  return (
    <CandidateShell org={ctx?.org}>
      <div className="cf-stagger mx-auto max-w-3xl overflow-hidden rounded-2xl border border-outline-variant/40 shadow-2xl shadow-black/30 md:grid md:grid-cols-2">
        {/* Left: test overview, on the dark theme surface. */}
        <div className="flex flex-col bg-surface-container p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <IconCode size={20} />
          </div>
          <h1 className="mt-6 text-headline-md text-on-surface">{ctx!.test.title}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{ctx?.org.name} Technical Evaluation</p>
          {ctx!.test.instructionsMd ? (
            <div className="prose-md mt-4 rounded-lg bg-surface-container-high/60 p-4 text-on-surface-variant">
              <Markdown>{ctx!.test.instructionsMd}</Markdown>
            </div>
          ) : null}
          <div className="mt-auto space-y-3 border-t border-outline-variant/40 pt-6 text-sm text-on-surface-variant">
            <span className="flex items-center gap-2">
              <IconClock size={16} /> Duration: {ctx!.test.durationMinutes} minutes
            </span>
            <span className="flex items-center gap-2">
              <IconList size={16} /> Format: {ctx!.test.questionCount} question
              {ctx!.test.questionCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Right: the actionable panel, deliberately re-scoped back to the
            light "recruiter" token set regardless of the surrounding dark
            theme, for legibility on the actual verification form / start
            action (and so nested components like EnvCheck/Card resolve
            light colors automatically instead of inheriting the dark scope). */}
        <div data-theme="recruiter" className="bg-surface-container-lowest p-8 text-on-surface">
          {phase === "landing" ? (
            <>
              <h2 className="text-headline-sm">Candidate verification</h2>
              <p className="mt-1 text-sm text-slate-500">
                Please confirm your details to begin{" "}
                {ctx!.proctoring.level !== "none" ? "the proctored session" : "your assessment"}.
              </p>
              <ProctoringDisclosure config={ctx?.proctoring ?? NO_PROCTORING} />
              <IdentityCard
                token={token}
                defaultName={ctx!.invitation.candidateName}
                onVerified={loadContext}
              />
            </>
          ) : phase === "envcheck" ? (
            <EnvCheck
              token={token}
              config={ctx?.proctoring ?? NO_PROCTORING}
              onReady={() => setPhase("ready")}
            />
          ) : (
            <StartCard
              token={token}
              fullscreenRequired={(ctx?.proctoring ?? NO_PROCTORING).fullscreenRequired}
              onStarted={() => setPhase("test")}
            />
          )}
          {ctx?.org.supportEmail ? (
            <p className="mt-4 text-xs text-slate-500">
              Trouble with this link? Contact{" "}
              <a href={`mailto:${ctx.org.supportEmail}`} className="font-medium text-accent hover:underline">
                {ctx.org.supportEmail}
              </a>
              .
            </p>
          ) : null}
        </div>
      </div>
    </CandidateShell>
  );
}

/**
 * Transparent, per-level disclosure of exactly what is (and is not) monitored,
 * describing only what is actually built (spec Section 10).
 */
function ProctoringDisclosure({ config }: { config: ProctoringConfig }) {
  const items: string[] = [
    "Your answers and code, with edit timestamps (recruiters can replay how a solution was written).",
    "Submission results, your IP address, and browser info.",
  ];
  if (config.level !== "none") {
    items.push("Tab/window switches and fullscreen exits are logged.");
    if (config.limits.maxTabSwitches) {
      items.push(
        `More than ${config.limits.maxTabSwitches} tab switches will submit the test automatically.`
      );
    }
    if (config.limits.maxFullscreenExits) {
      items.push(
        `More than ${config.limits.maxFullscreenExits} fullscreen exits will submit the test automatically.`
      );
    }
  }
  if (config.webcamRequired) {
    items.push(
      "Webcam snapshots are captured at random moments (no continuous video, no audio recording)."
    );
  }
  if (config.level === "lockdown") {
    items.push("Copy/paste into the code editor is blocked, and blocked attempts are logged.");
  }
  return (
    <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 text-xs leading-relaxed text-slate-600">
      <b className="text-slate-800">Proctoring notice, level: {config.level}.</b>
      <p className="mt-1">By continuing, you consent to what is recorded below.</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
      <p className="mt-2">
        {config.level === "none" ? "No camera, microphone, or screen monitoring is used. " : ""}
        The timer is enforced by the server. When it reaches zero, whatever is saved is submitted
        automatically. These signals are reviewed by a human; nothing is auto-rejected.
      </p>
    </div>
  );
}

function CandidateShell({
  children,
  org,
}: {
  children: React.ReactNode;
  org?: CandidateContext["org"];
}) {
  // Attribution only when white-labeling is actually in effect (a custom
  // logo or name is showing) and the client hasn't explicitly hidden it.
  const showAttribution = org && !org.hideCodeForgeBranding && (org.logoUrl || org.name !== "CodeForge");
  const accentStyle: CSSProperties | undefined = org?.accentColor
    ? ({
        "--color-accent": org.accentColor,
        "--color-accent-hover": org.accentColorHover ?? org.accentColor,
      } as CSSProperties)
    : undefined;
  return (
    <main data-theme="candidate" style={accentStyle} className="relative min-h-screen bg-surface py-10">
      <div className="cf-grid-mesh pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mb-8 flex flex-col items-center gap-1 px-4">
        <Wordmark branding={org ?? { name: "CodeForge", hideCodeForgeBranding: false }} />
        {org?.tagline ? <div className="text-xs text-on-surface-variant">{org.tagline}</div> : null}
        {showAttribution ? (
          <div className="text-[10px] uppercase tracking-wide text-on-surface-variant">Powered by CodeForge</div>
        ) : null}
      </div>
      <div className="relative px-4">{children}</div>
    </main>
  );
}

function IdentityCard({
  token,
  defaultName,
  onVerified,
}: {
  token: string;
  defaultName: string;
  onVerified: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await candidateApi(token, "/api/candidate/verify-identity", {
        method: "POST",
        body: { name, email },
      });
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Email address">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </Field>
      {error ? <ErrorNote message={error} /> : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Checking…" : "Verify & continue"} <IconArrowRight size={16} />
      </Button>
    </form>
  );
}

function StartCard({
  token,
  fullscreenRequired,
  onStarted,
}: {
  token: string;
  fullscreenRequired: boolean;
  onStarted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    // Fullscreen lock-in (spec 3.4.3): the test only starts once granted.
    if (fullscreenRequired && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        setError("Fullscreen is required for this test. Please allow it and try again.");
        setBusy(false);
        return;
      }
    }
    try {
      await candidateApi(token, "/api/candidate/start", { method: "POST" });
      onStarted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the test");
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-headline-sm">Ready when you are</h2>
      <p className="mt-1 text-sm text-slate-500">
        The timer starts the moment you click the button and cannot be paused. If your browser
        crashes, reopen this same link and you&apos;ll resume with your work intact and the original
        deadline.
      </p>
      {error ? <div className="mt-3"><ErrorNote message={error} /></div> : null}
      <Button onClick={start} disabled={busy} className="mt-4 w-full">
        {busy ? "Starting…" : "Start test"} <IconArrowRight size={16} />
      </Button>
    </div>
  );
}
