import { useEffect, useState } from "react";
import { getSystemInfo, type SystemInfo, type Violation } from "./lib/tauri";
import { useProcessMonitor } from "./hooks/useProcessMonitor";
import { SystemStatus } from "./components/SystemStatus";
import { ViolationAlert } from "./components/ViolationAlert";
import { IconShield } from "./components/icons";

/**
 * Phase 1 proved IPC works. Phase 2 adds the live process-monitor/blacklist
 * feed on top of it. Everything past this (VM detection, kiosk mode, screen
 * capture prevention, ...) is later-phase work, not started here.
 */
export function App() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { violations, hardViolations, error: monitorError } = useProcessMonitor();
  const [alertViolation, setAlertViolation] = useState<Violation | null>(null);

  useEffect(() => {
    getSystemInfo()
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Surface the newest hard violation as a fullscreen alert once.
  useEffect(() => {
    const latest = hardViolations[hardViolations.length - 1];
    if (latest) setAlertViolation(latest);
  }, [hardViolations.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = hardViolations.length === 0;

  return (
    <div className="app-shell">
      {alertViolation ? (
        <ViolationAlert violation={alertViolation} onDismiss={() => setAlertViolation(null)} />
      ) : null}

      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <IconShield size={20} />
          </span>
          <div>
            <div className="brand-title">CodeForge Sentinel</div>
            <div className="brand-subtitle">System integrity monitor</div>
          </div>
        </div>

        <span className={`status-pill ${clear ? "ok" : "danger"}`}>
          <span className={`status-dot ${clear ? "" : "pulse"}`} />
          {clear ? "All clear" : `${hardViolations.length} violation${hardViolations.length === 1 ? "" : "s"}`}
        </span>
      </header>

      <main className="app-body">
        <div className="card">
          <div className="card-title">System</div>
          {error ? (
            <p className="error-banner">IPC error: {error}</p>
          ) : info ? (
            <dl className="kv-grid">
              <dt>Operating system</dt>
              <dd>{info.osName}</dd>
              <dt>Version</dt>
              <dd>{info.osVersion}</dd>
              <dt>Hostname</dt>
              <dd>{info.hostname}</dd>
            </dl>
          ) : (
            <p className="text-muted">Contacting Rust core&hellip;</p>
          )}
        </div>

        {monitorError ? (
          <p className="error-banner">Process monitor error: {monitorError}</p>
        ) : (
          <SystemStatus violations={violations} />
        )}
      </main>
    </div>
  );
}
