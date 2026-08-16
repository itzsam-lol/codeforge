import { useEffect, useState } from "react";
import { detectVirtualMachine, getSystemInfo, type SystemInfo, type Violation, type VmDetectionResult } from "./lib/tauri";
import { useProcessMonitor } from "./hooks/useProcessMonitor";
import { SystemStatus } from "./components/SystemStatus";
import { ViolationAlert } from "./components/ViolationAlert";
import { VmStatus } from "./components/VmStatus";
import { SessionConnect } from "./components/SessionConnect";
import { Controls } from "./components/Controls";
import { Card, Badge } from "./components/ui";
import { IconShield } from "./components/icons";

const TOPBAR_H = 56;

/**
 * Same shell shape as apps/web's (dash)/layout.tsx topbar (height, border,
 * bg-surface-container-lowest) and the candidate flow's cf-grid-mesh page
 * texture — Sentinel has no multi-page nav to go with it (single-screen
 * utility), so this is the topbar pattern alone, not the full sidebar shell.
 */
export function App() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { violations, hardViolations, error: monitorError } = useProcessMonitor();
  const [alertViolation, setAlertViolation] = useState<Violation | null>(null);
  const [vmResult, setVmResult] = useState<VmDetectionResult | null>(null);
  const [vmError, setVmError] = useState<string | null>(null);

  useEffect(() => {
    getSystemInfo()
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    detectVirtualMachine()
      .then(setVmResult)
      .catch((err) => setVmError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Surface the newest hard violation as a fullscreen alert once.
  useEffect(() => {
    const latest = hardViolations[hardViolations.length - 1];
    if (latest) setAlertViolation(latest);
  }, [hardViolations.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = hardViolations.length === 0;

  return (
    <div className="relative flex min-h-screen flex-col bg-surface">
      <div className="cf-grid-mesh pointer-events-none absolute inset-0" aria-hidden />

      {alertViolation ? <ViolationAlert violation={alertViolation} onDismiss={() => setAlertViolation(null)} /> : null}

      <header
        style={{ height: TOPBAR_H }}
        className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 sm:px-6"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-control bg-accent-soft text-accent">
          <IconShield size={18} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">CodeForge Sentinel</div>
          <div className="text-xs leading-tight text-on-surface-variant">System integrity monitor</div>
        </div>
        <Badge color={clear ? "ok" : "bad"} icon={clear ? "pass" : "fail"} dashed={false}>
          {clear ? "All clear" : `${hardViolations.length} violation${hardViolations.length === 1 ? "" : "s"}`}
        </Badge>
      </header>

      <main className="cf-stagger relative z-[1] mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6 sm:px-6">
        <Card className="p-5">
          <div className="text-headline-sm">System</div>
          {error ? (
            <p className="mt-3 rounded bg-bad-bg px-3 py-2 text-sm text-bad">IPC error: {error}</p>
          ) : info ? (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-on-surface-variant">Operating system</dt>
              <dd>{info.osName}</dd>
              <dt className="text-on-surface-variant">Version</dt>
              <dd>{info.osVersion}</dd>
              <dt className="text-on-surface-variant">Hostname</dt>
              <dd>{info.hostname}</dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-on-surface-variant">Contacting Rust core&hellip;</p>
          )}
        </Card>

        <VmStatus result={vmResult} error={vmError} />

        <SessionConnect />

        <Controls />

        {monitorError ? (
          <Card className="p-5">
            <p className="rounded bg-bad-bg px-3 py-2 text-sm text-bad">Process monitor error: {monitorError}</p>
          </Card>
        ) : (
          <SystemStatus violations={violations} />
        )}
      </main>
    </div>
  );
}
