import { useEffect, useState } from "react";
import { getSystemInfo, type SystemInfo } from "./lib/tauri";

/**
 * Phase 1 scaffold: proves the Rust <-> WebView IPC round-trip works.
 * Everything past this (process monitor, kiosk mode, VM detection, ...) is
 * later-phase work, deliberately not started here.
 */
export function App() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSystemInfo()
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

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
        gap: 12,
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>CodeForge Sentinel</h1>
      <p style={{ fontSize: 13, color: "#94a3b8" }}>System check in progress&hellip;</p>
      {error ? (
        <p style={{ fontSize: 12, color: "#f87171" }}>IPC error: {error}</p>
      ) : info ? (
        <div style={{ fontSize: 12, color: "#4ade80", fontFamily: "monospace" }}>
          {info.osName} {info.osVersion} &middot; {info.hostname}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "#64748b" }}>Contacting Rust core&hellip;</p>
      )}
    </main>
  );
}
