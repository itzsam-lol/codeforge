"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hqApi, ApiError } from "@/lib/api";
import { Badge, Button, Card, ErrorNote, Field, Input, Spinner, StatusBadge } from "@/components/ui";

interface TargetSummary {
  id: string;
  host: string;
  sshPort: number;
  sshUsername: string;
  sshKeyFingerprint: string;
  repoUrl: string;
  appDomain: string;
  mediaDomain: string;
  updatedAt: string;
}

interface Step {
  id: string;
  seq: number;
  name: string;
  status: "pending" | "running" | "succeeded" | "failed";
  output: string | null;
}

interface Run {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  steps: Step[];
}

interface RunSummary {
  id: string;
  status: Run["status"];
  createdAt: string;
}

const DIAGNOSTIC_LABELS = { status: "Container status", disk: "Disk space", logs: "Recent API logs" } as const;
type DiagnosticKey = keyof typeof DIAGNOSTIC_LABELS;

const EMPTY_FORM = {
  host: "",
  sshPort: "22",
  sshUsername: "ubuntu",
  sshPrivateKey: "",
  repoUrl: "https://github.com/itzsam-lol/codeforge.git",
  appDomain: "",
  mediaDomain: "",
};

export function ProvisioningPanel({
  clientId,
  target,
  onTargetSaved,
}: {
  clientId: string;
  target: TargetSummary | null;
  onTargetSaved: () => void;
}) {
  const [editingTarget, setEditingTarget] = useState(!target);
  const [form, setForm] = useState(EMPTY_FORM);
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runsLoadError, setRunsLoadError] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [runningDiagnostic, setRunningDiagnostic] = useState<DiagnosticKey | null>(null);
  const [diagnosticOutput, setDiagnosticOutput] = useState<{ key: DiagnosticKey; output: string } | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const d = await hqApi<{ runs: RunSummary[] }>(`/api/clients/${clientId}/provisioning/runs`);
      setRuns(d.runs);
      setRunsLoadError(null);
      return d.runs;
    } catch (err) {
      setRunsLoadError(err instanceof ApiError ? err.message : "Could not load deployment runs");
      return null;
    }
  }, [clientId]);

  const pollRun = useCallback((runId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const d = await hqApi<{ run: Run }>(`/api/provisioning/runs/${runId}`);
        setActiveRun(d.run);
        setRunsLoadError(null);
        if (d.run.status !== "queued" && d.run.status !== "running") {
          if (pollRef.current) clearInterval(pollRef.current);
          void loadRuns();
        }
      } catch (err) {
        setRunsLoadError(
          err instanceof ApiError ? err.message : "Lost connection while checking deployment status"
        );
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 3000);
  }, [loadRuns]);

  useEffect(() => {
    void loadRuns().then((list) => {
      if (!list) return;
      const inFlight = list.find((r) => r.status === "running" || r.status === "queued");
      if (inFlight) pollRun(inFlight.id);
      else if (list[0]) pollRun(list[0].id);
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function saveTarget() {
    setSavingTarget(true);
    setTargetError(null);
    try {
      await hqApi(`/api/clients/${clientId}/provisioning/target`, {
        method: "PUT",
        body: { ...form, sshPort: Number(form.sshPort) },
      });
      setEditingTarget(false);
      setForm(EMPTY_FORM);
      onTargetSaved();
    } catch (err) {
      setTargetError(err instanceof ApiError ? err.message : "Could not save the deployment target");
    } finally {
      setSavingTarget(false);
    }
  }

  async function runDiagnostic(key: DiagnosticKey) {
    setRunningDiagnostic(key);
    setDiagnosticError(null);
    try {
      const d = await hqApi<{ output: string }>(`/api/clients/${clientId}/provisioning/diagnostics`, {
        method: "POST",
        body: { command: key },
      });
      setDiagnosticOutput({ key, output: d.output });
    } catch (err) {
      setDiagnosticError(err instanceof ApiError ? err.message : "Could not run this diagnostic");
    } finally {
      setRunningDiagnostic(null);
    }
  }

  async function startRun() {
    setStarting(true);
    setRunError(null);
    try {
      const d = await hqApi<{ run: { id: string } }>(`/api/clients/${clientId}/provisioning/runs`, { method: "POST" });
      pollRun(d.run.id);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : "Could not start a run");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-on-surface">Deployment target</h3>
          {target && !editingTarget ? (
            <button onClick={() => setEditingTarget(true)} className="text-xs font-medium text-accent hover:underline">
              Edit
            </button>
          ) : null}
        </div>

        {target && !editingTarget ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-on-surface-variant">Host</dt>
            <dd className="text-on-surface">
              {target.sshUsername}@{target.host}:{target.sshPort}
            </dd>
            <dt className="text-on-surface-variant">Key fingerprint</dt>
            <dd className="font-mono text-xs text-on-surface">{target.sshKeyFingerprint}</dd>
            <dt className="text-on-surface-variant">App domain</dt>
            <dd className="text-on-surface">{target.appDomain}</dd>
            <dt className="text-on-surface-variant">Media domain</dt>
            <dd className="text-on-surface">{target.mediaDomain}</dd>
            <dt className="text-on-surface-variant">Repository</dt>
            <dd className="truncate text-on-surface">{target.repoUrl}</dd>
          </dl>
        ) : (
          <div className="mt-4 space-y-4">
            {targetError ? <ErrorNote message={targetError} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SSH host">
                <Input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="1.2.3.4" />
              </Field>
              <Field label="SSH port">
                <Input value={form.sshPort} onChange={(e) => setForm((f) => ({ ...f, sshPort: e.target.value }))} />
              </Field>
              <Field label="SSH username">
                <Input value={form.sshUsername} onChange={(e) => setForm((f) => ({ ...f, sshUsername: e.target.value }))} />
              </Field>
              <Field label="Repository URL">
                <Input value={form.repoUrl} onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))} />
              </Field>
              <Field label="App domain">
                <Input value={form.appDomain} onChange={(e) => setForm((f) => ({ ...f, appDomain: e.target.value }))} placeholder="app.client.com" />
              </Field>
              <Field label="Media domain">
                <Input value={form.mediaDomain} onChange={(e) => setForm((f) => ({ ...f, mediaDomain: e.target.value }))} placeholder="media.client.com" />
              </Field>
            </div>
            <Field
              label="SSH private key"
              hint="Stored encrypted, never displayed again. Re-paste it any time you change other fields on this target."
            >
              <textarea
                rows={5}
                value={form.sshPrivateKey}
                onChange={(e) => setForm((f) => ({ ...f, sshPrivateKey: e.target.value }))}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                className="w-full rounded-control bg-surface-container px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </Field>
            <div className="flex gap-2">
              <Button disabled={savingTarget} onClick={() => void saveTarget()}>
                {savingTarget ? "Saving…" : "Save target"}
              </Button>
              {target ? (
                <Button variant="secondary" onClick={() => setEditingTarget(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Card>

      {target ? (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-on-surface">Deployment runs</h3>
            <Button size="sm" disabled={starting || activeRun?.status === "running" || activeRun?.status === "queued"} onClick={() => void startRun()}>
              {starting ? "Starting…" : "Start deployment"}
            </Button>
          </div>
          {runError ? (
            <div className="mt-3">
              <ErrorNote message={runError} />
            </div>
          ) : null}
          {runsLoadError ? (
            <div className="mt-3">
              <ErrorNote message={runsLoadError} />
            </div>
          ) : null}

          {activeRun ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={activeRun.status} />
                {activeRun.errorMessage ? <span className="text-xs text-bad">{activeRun.errorMessage}</span> : null}
              </div>
              <div className="space-y-2">
                {activeRun.steps.map((s) => (
                  <div key={s.id} className="rounded-control bg-surface-container p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-on-surface">{s.name}</span>
                      <Badge color={s.status === "succeeded" ? "ok" : s.status === "failed" ? "bad" : s.status === "running" ? "accent" : "neutral"}>
                        {s.status}
                      </Badge>
                    </div>
                    {s.output ? (
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-surface-container-high p-2 font-mono text-[11px] leading-relaxed text-on-surface-variant">
                        {s.output}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : runs && runs.length === 0 ? (
            <p className="mt-3 text-sm text-on-surface-variant">No deployment runs yet.</p>
          ) : !runs && !runsLoadError ? (
            <Spinner label="Loading deployment runs…" />
          ) : null}
        </Card>
      ) : null}

      {target ? (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-on-surface">Diagnostics</h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Read-only commands run over the same SSH connection as provisioning. Never a free-form shell.
          </p>
          {diagnosticError ? (
            <div className="mt-3">
              <ErrorNote message={diagnosticError} />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(DIAGNOSTIC_LABELS) as DiagnosticKey[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant="secondary"
                disabled={runningDiagnostic !== null}
                onClick={() => void runDiagnostic(key)}
              >
                {runningDiagnostic === key ? "Running…" : DIAGNOSTIC_LABELS[key]}
              </Button>
            ))}
          </div>
          {diagnosticOutput ? (
            <div className="mt-3">
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                {DIAGNOSTIC_LABELS[diagnosticOutput.key]}
              </span>
              <pre className="max-h-64 overflow-auto rounded bg-surface-container-high p-3 font-mono text-[11px] leading-relaxed text-on-surface-variant">
                {diagnosticOutput.output}
              </pre>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
