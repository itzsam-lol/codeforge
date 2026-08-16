import { useEffect, useState } from "react";
import { onSessionLink, startHeartbeat, stopHeartbeat } from "@/lib/tauri";
import { IconLink } from "./icons";

type Status = "idle" | "connected" | "error";

/**
 * Phase 10: the candidate side of the loop. apps/web opens
 * codeforge-sentinel://start?apiUrl=...&token=... when a test requires
 * Sentinel (see /t/[token]'s SentinelGate); the Rust side
 * (services/session_link.rs) parses it, starts the heartbeat itself, and
 * emits sentinel://session so this component only has to reflect status,
 * never re-implement the connect logic. Manual fields are the fallback for
 * whenever the link can't reach Sentinel — dev builds before the protocol
 * has been registered, or a candidate who launched Sentinel by hand.
 */
export function SessionConnect() {
  const [status, setStatus] = useState<Status>("idle");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [tokenPreview, setTokenPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unlisten = onSessionLink((event) => {
      if (event.connected) {
        setStatus("connected");
        setApiBaseUrl(event.apiBaseUrl ?? "");
        setTokenPreview(event.tokenPreview);
        setError(null);
      } else {
        setStatus("error");
        setError(event.error ?? "Could not connect to the test session.");
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await startHeartbeat(apiBaseUrl, token);
      setStatus("connected");
      setTokenPreview(`${token.slice(0, 6)}…`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await stopHeartbeat();
    } finally {
      setStatus("idle");
      setTokenPreview(null);
      setToken("");
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">
        <span>Test session</span>
        <span className={`status-pill ${status === "connected" ? "ok" : status === "error" ? "danger" : ""}`}>
          <span className={`status-dot ${status === "connected" ? "" : "pulse"}`} />
          {status === "connected" ? "Connected" : status === "error" ? "Not connected" : "Waiting"}
        </span>
      </div>

      {status === "connected" ? (
        <div className="env-row">
          <span className="env-icon ok">
            <IconLink size={18} />
          </span>
          <div>
            <div className="env-title">Reporting to {apiBaseUrl}</div>
            <div className="env-subtitle">Session token {tokenPreview}. Sending a heartbeat every 15s.</div>
          </div>
        </div>
      ) : (
        <>
          <p className="text-footnote">
            Open the &ldquo;Launch Sentinel&rdquo; link from your test page and this connects
            automatically. If that link didn&apos;t work, paste the details from the test page here.
          </p>
          {error ? <p className="error-banner">{error}</p> : null}
          <div className="kv-grid" style={{ marginTop: "var(--space-4)" }}>
            <dt>API URL</dt>
            <dd>
              <input
                className="mono"
                style={{
                  width: "100%",
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-control)",
                  color: "var(--text-primary)",
                  padding: "6px 10px",
                  fontSize: "var(--text-footnote-size)",
                }}
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="https://app.codeforge.example"
              />
            </dd>
            <dt>Candidate token</dt>
            <dd>
              <input
                className="mono"
                style={{
                  width: "100%",
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-control)",
                  color: "var(--text-primary)",
                  padding: "6px 10px",
                  fontSize: "var(--text-footnote-size)",
                }}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="from your test page"
              />
            </dd>
          </div>
        </>
      )}

      <div className="control-grid" style={{ marginTop: "var(--space-4)" }}>
        {status === "connected" ? (
          <button className="btn" disabled={busy} onClick={() => void disconnect()}>
            {busy ? "Working…" : "Disconnect"}
          </button>
        ) : (
          // The one tinted primary action in the app — connecting to a
          // session is the actual gate a candidate needs to clear, ahead of
          // any of Controls' secondary toggles.
          <button
            className="btn btn-primary"
            disabled={busy || apiBaseUrl.length === 0 || token.length < 32}
            onClick={() => void connect()}
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}
