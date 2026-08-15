import { useEffect, useState } from "react";
import { getSystemInfo, type SystemInfo, type Violation } from "./lib/tauri";
import { useProcessMonitor } from "./hooks/useProcessMonitor";
import { SystemStatus } from "./components/SystemStatus";
import { ViolationAlert } from "./components/ViolationAlert";

/**
 * Phase 1 proved IPC works. Phase 2 adds the live process-monitor/blacklist
 * feed on top of it. Everything past this (kiosk mode, VM detection, screen
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

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        gap: 20,
        padding: 24,
      }}
    >
      {alertViolation ? (
        <ViolationAlert violation={alertViolation} onDismiss={() => setAlertViolation(null)} />
      ) : null}

      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>CodeForge Sentinel</h1>
        <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>System check in progress&hellip;</p>
        {error ? (
          <p style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>IPC error: {error}</p>
        ) : info ? (
          <div style={{ fontSize: 12, color: "#4ade80", fontFamily: "monospace", marginTop: 8 }}>
            {info.osName} {info.osVersion} &middot; {info.hostname}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Contacting Rust core&hellip;</p>
        )}
      </div>

      {monitorError ? (
        <p style={{ fontSize: 12, color: "#f87171" }}>Process monitor error: {monitorError}</p>
      ) : (
        <SystemStatus violations={violations} />
      )}
    </main>
  );
}
