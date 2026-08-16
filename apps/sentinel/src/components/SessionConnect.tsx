import { useEffect, useState } from "react";
import { onSessionLink, startHeartbeat, stopHeartbeat } from "@/lib/tauri";
import { Badge, Button, Card, Field, Input } from "./ui";
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
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-headline-sm">Test session</span>
        <Badge color={status === "connected" ? "ok" : status === "error" ? "bad" : "neutral"} dashed={status === "idle"}>
          {status === "connected" ? "Connected" : status === "error" ? "Not connected" : "Waiting"}
        </Badge>
      </div>

      {status === "connected" ? (
        <div className="mt-3 flex items-start gap-3">
          <IconLink size={20} className="mt-0.5 shrink-0 text-ok" />
          <div>
            <div className="text-sm font-medium">Reporting to {apiBaseUrl}</div>
            <div className="text-xs text-on-surface-variant">
              Session token {tokenPreview}. Sending a heartbeat every 15s.
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-on-surface-variant">
            Open the &ldquo;Launch Sentinel&rdquo; link from your test page and this connects
            automatically. If that link didn&apos;t work, paste the details from the test page here.
          </p>
          {error ? <p className="mt-3 rounded bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p> : null}
          <div className="mt-4 space-y-3">
            <Field label="API URL">
              <Input
                className="font-mono text-xs"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="https://app.codeforge.example"
              />
            </Field>
            <Field label="Candidate token">
              <Input
                className="font-mono text-xs"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="from your test page"
              />
            </Field>
          </div>
        </>
      )}

      <div className="mt-4">
        {status === "connected" ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void disconnect()}>
            {busy ? "Working…" : "Disconnect"}
          </Button>
        ) : (
          // The one tinted primary action in the app — connecting to a
          // session is the actual gate a candidate needs to clear, ahead of
          // any of Controls' secondary toggles.
          <Button size="sm" disabled={busy || apiBaseUrl.length === 0 || token.length < 32} onClick={() => void connect()}>
            {busy ? "Connecting…" : "Connect"}
          </Button>
        )}
      </div>
    </Card>
  );
}
