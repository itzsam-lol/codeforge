"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { candidateApi, ApiError } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { Button, Card, ErrorNote, Field, Input, Spinner } from "@/components/ui";
import { TestRunner } from "@/components/candidate/TestRunner";
import { EnvCheck } from "@/components/candidate/EnvCheck";
import type { ProctoringConfig } from "@/lib/proctoring";
import { IconCheckCircle, IconClock, IconList, IconLock, IconSave } from "@/components/icons";

interface CandidateContext {
  serverNow: string;
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
      <CandidateShell>
        <Card className="cf-rise mx-auto max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <IconLock size={22} />
          </div>
          <h1 className="mt-3 text-lg font-semibold">This link isn&apos;t available</h1>
          <p className="mt-2 text-sm text-slate-500">{fatal}</p>
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
      <CandidateShell>
        <Card className="cf-rise mx-auto max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <IconCheckCircle size={24} />
          </div>
          <h1 className="mt-3 text-lg font-semibold">Your test has been submitted</h1>
          <p className="mt-2 text-sm text-slate-500">
            Thanks, {ctx?.invitation.candidateName}. Your responses for
            {" "}<b>{ctx?.test.title}</b> are in. The hiring team will review them and get back to
            you — you can close this tab.
          </p>
        </Card>
      </CandidateShell>
    );
  }

  return (
    <CandidateShell>
      <div className="cf-stagger mx-auto max-w-2xl space-y-4">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Technical assessment
          </p>
          <h1 className="mt-1 text-2xl font-bold">{ctx!.test.title}</h1>
          <div className="mt-3 flex flex-wrap gap-5 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <IconClock className="text-slate-400" /> {ctx!.test.durationMinutes} minutes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconList className="text-slate-400" /> {ctx!.test.questionCount} questions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconSave className="text-slate-400" /> Work autosaves continuously
            </span>
          </div>
          {ctx!.test.instructionsMd ? (
            <div className="mt-4 rounded-lg bg-slate-50 p-4">
              <Markdown>{ctx!.test.instructionsMd}</Markdown>
            </div>
          ) : null}
          <ProctoringDisclosure config={ctx?.proctoring ?? NO_PROCTORING} />
        </Card>

        {phase === "landing" ? (
          <IdentityCard
            token={token}
            defaultName={ctx!.invitation.candidateName}
            onVerified={loadContext}
          />
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
      </div>
    </CandidateShell>
  );
}

/**
 * Transparent, per-level disclosure of exactly what is (and is not) monitored
 * — describing only what is actually built (spec Section 10).
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
    <div className="mt-4 rounded-lg border border-slate-200 p-4 text-xs leading-relaxed text-slate-500">
      <b className="text-slate-700">
        What we record (proctoring level: {config.level}):
      </b>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
      <p className="mt-2">
        {config.level === "none" ? "No camera, microphone, or screen monitoring is used. " : ""}
        The timer is enforced by the server — when it reaches zero, whatever is saved is submitted
        automatically. These signals are reviewed by a human; nothing is auto-rejected.
      </p>
    </div>
  );
}

function CandidateShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <div className="mb-6 text-center text-lg font-bold tracking-tight">
        Code<span className="text-indigo-600">Forge</span>
      </div>
      <div className="px-4">{children}</div>
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
    <Card className="p-6">
      <h2 className="text-sm font-semibold">Confirm your identity</h2>
      <p className="mt-1 text-xs text-slate-500">
        Enter your full name and the email address this invitation was sent to.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email">
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
          {busy ? "Checking…" : "Continue"}
        </Button>
      </form>
    </Card>
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
        setError("Fullscreen is required for this test — please allow it and try again.");
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
    <Card className="p-6 text-center">
      <h2 className="text-sm font-semibold">Ready when you are</h2>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
        The timer starts the moment you click the button and cannot be paused. If your browser
        crashes, reopen this same link — you&apos;ll resume with your work intact and the original
        deadline.
      </p>
      {error ? <div className="mt-3"><ErrorNote message={error} /></div> : null}
      <Button onClick={start} disabled={busy} className="mt-4 px-8">
        {busy ? "Starting…" : "Start test"}
      </Button>
    </Card>
  );
}
