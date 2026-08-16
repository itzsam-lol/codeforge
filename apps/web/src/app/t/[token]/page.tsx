"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { candidateApi, ApiError } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { Button, Card, ErrorNote, Field, Input, Spinner } from "@/components/ui";
import { TestRunner, type FinishSummary } from "@/components/candidate/TestRunner";
import { EnvCheck } from "@/components/candidate/EnvCheck";
import { PracticeModal } from "@/components/candidate/PracticeModal";
import { GetHelpModal } from "@/components/candidate/GetHelpModal";
import { SentinelGate } from "@/components/candidate/SentinelGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
    sentinelConnected: boolean;
  } | null;
}

type Phase = "loading" | "error" | "landing" | "envcheck" | "ready" | "test" | "done";

const NO_PROCTORING: ProctoringConfig = {
  level: "none",
  limits: {},
  webcamRequired: false,
  fullscreenRequired: false,
  sentinelRequired: false,
};

export default function CandidatePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [phase, setPhase] = useState<Phase>("loading");
  const [ctx, setCtx] = useState<CandidateContext | null>(null);
  const [fatal, setFatal] = useState<string>("");
  const [finishSummary, setFinishSummary] = useState<FinishSummary | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sentinelConnected, setSentinelConnected] = useState(false);

  const loadContext = useCallback(async () => {
    try {
      const data = await candidateApi<CandidateContext>(token, "/api/candidate/context");
      setCtx(data);
      if (data.session?.sentinelConnected) setSentinelConnected(true);
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
      <ErrorBoundary label="Your test">
        <TestRunner
          token={token}
          proctoring={ctx?.proctoring ?? NO_PROCTORING}
          supportEmail={ctx?.org.supportEmail ?? null}
          onFinished={(summary) => {
            if (summary) setFinishSummary(summary);
            setPhase("done");
          }}
        />
      </ErrorBoundary>
    );
  }

  if (phase === "done") {
    return (
      <CandidateShell org={ctx?.org} token={token}>
        <Card className="cf-rise mx-auto max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok-bg text-ok">
            <IconCheckCircle size={24} />
          </div>
          <h1 className="mt-3 text-headline-sm text-on-surface">Your test has been submitted</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Thanks, {ctx?.invitation.candidateName}. Your responses for
            {" "}<b>{ctx?.test.title}</b> are in. The hiring team will review them and get back to
            you, you can close this tab.
          </p>
          {finishSummary ? (
            <p className="mt-4 rounded-lg bg-surface-container-high px-3 py-2 text-xs text-on-surface-variant">
              You answered {finishSummary.answered} of {finishSummary.total} question
              {finishSummary.total === 1 ? "" : "s"}
              {finishSummary.flagged > 0
                ? ` (${finishSummary.flagged} flagged for your own review)`
                : ""}
              .
            </p>
          ) : null}
          <button
            onClick={() => setHelpOpen(true)}
            className="mt-4 text-xs font-medium text-accent hover:underline"
          >
            Have a question about your submission?
          </button>
        </Card>
        <GetHelpModal
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          token={token}
          supportEmail={ctx?.org.supportEmail ?? null}
        />
      </CandidateShell>
    );
  }

  return (
    <CandidateShell org={ctx?.org} token={token}>
      <div className="cf-stagger mx-auto max-w-3xl overflow-hidden rounded-2xl shadow-2xl shadow-black/30 md:grid md:grid-cols-2">
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
          <div className="mt-auto space-y-3 pt-6 text-sm text-on-surface-variant">
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
              <p className="mt-1 text-sm text-on-surface-variant">
                Please confirm your details to begin{" "}
                {ctx!.proctoring.level !== "none" ? "the proctored session" : "your assessment"}.
              </p>
              <ProctoringDisclosure config={ctx?.proctoring ?? NO_PROCTORING} privacyUrl={ctx?.org.privacyUrl} />
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
          ) : (ctx?.proctoring ?? NO_PROCTORING).sentinelRequired && !sentinelConnected ? (
            <SentinelGate token={token} onConnected={() => setSentinelConnected(true)} />
          ) : (
            <StartCard
              token={token}
              fullscreenRequired={(ctx?.proctoring ?? NO_PROCTORING).fullscreenRequired}
              onStarted={() => setPhase("test")}
            />
          )}
          <p className="mt-4 text-xs text-on-surface-variant">
            Trouble with this link?{" "}
            <button onClick={() => setHelpOpen(true)} className="font-medium text-accent hover:underline">
              Get help
            </button>
            .
          </p>
        </div>
      </div>
      <GetHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        token={token}
        supportEmail={ctx?.org.supportEmail ?? null}
      />
    </CandidateShell>
  );
}

/**
 * Transparent, per-level disclosure of exactly what is (and is not) monitored,
 * describing only what is actually built (spec Section 10).
 */
function ProctoringDisclosure({ config, privacyUrl }: { config: ProctoringConfig; privacyUrl?: string | null }) {
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
  if (config.sentinelRequired) {
    items.push(
      "CodeForge Sentinel (a desktop app) must be running. It reports running application names " +
        "matched against a prohibited-software list and your active network connection count."
    );
  }
  return (
    <div className="mt-4 rounded-xl bg-accent/5 p-4 text-xs leading-relaxed text-on-surface-variant">
      <b className="text-on-surface">Proctoring notice, level: {config.level}.</b>
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
        {privacyUrl ? (
          <>
            {" "}
            Full details in the{" "}
            <a href={privacyUrl} target="_blank" rel="noreferrer" className="text-accent underline">
              organization&apos;s privacy policy
            </a>
            .
          </>
        ) : null}
      </p>
    </div>
  );
}

function CandidateShell({
  children,
  org,
  token,
}: {
  children: React.ReactNode;
  org?: CandidateContext["org"];
  /** Omit on screens where the link may not correspond to a valid session
   *  (e.g. the error screen) — the download link only renders when present. */
  token?: string;
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
      {org?.privacyUrl ? (
        <div className="relative mt-10 text-center">
          <a
            href={org.privacyUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-on-surface-variant underline hover:text-accent"
          >
            {org.name}&apos;s privacy policy
          </a>
        </div>
      ) : null}
      {token ? (
        <div className="relative mt-2 text-center">
          <button
            type="button"
            onClick={() => void downloadMyData(token)}
            className="text-xs text-on-surface-variant underline hover:text-accent"
          >
            Download my data
          </button>
        </div>
      ) : null}
    </main>
  );
}

/**
 * GDPR Article 15/20 self-serve export — apps/api's GET
 * /api/candidate/my-data, saved as a browser download rather than parsed
 * and rendered: this is a raw copy of the candidate's own record, not a UI
 * for it.
 */
async function downloadMyData(token: string) {
  const res = await fetch(`/api/candidate/my-data`, { headers: { "x-candidate-token": token } });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  const [practicing, setPracticing] = useState(false);

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
      <p className="mt-1 text-sm text-on-surface-variant">
        The timer starts the moment you click the button and cannot be paused. If your browser
        crashes, reopen this same link and you&apos;ll resume with your work intact and the original
        deadline.
      </p>
      {error ? <div className="mt-3"><ErrorNote message={error} /></div> : null}
      <Button onClick={start} disabled={busy} className="mt-4 w-full">
        {busy ? "Starting…" : "Start test"} <IconArrowRight size={16} />
      </Button>
      <button
        type="button"
        onClick={() => setPracticing(true)}
        className="mt-3 w-full text-center text-xs font-medium text-on-surface-variant hover:text-accent hover:underline"
      >
        Try a sample question first
      </button>
      <PracticeModal open={practicing} onClose={() => setPracticing(false)} />
    </div>
  );
}
