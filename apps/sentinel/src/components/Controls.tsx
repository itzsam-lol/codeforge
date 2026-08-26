import { useState } from "react";
import {
  clearClipboardNow,
  disableCaptureProtection,
  enableCaptureProtection,
  enterKioskWindow,
  exitKioskWindow,
  getActiveConnections,
  getDisplayCount,
  setClipboardLockdown,
  type NetworkConnection,
} from "@/lib/tauri";
import { Button, Card } from "./ui";

/**
 * Manual, individual toggles for debugging — most people should use the
 * "Lockdown" card above (LockdownControl.tsx), which sequences all of these
 * together plus the global hotkey-block hook. Everything wired up here is
 * safe to click on its own: kiosk fullscreen is fully reversible, capture
 * protection only affects this window's own screenshots, clipboard actions
 * are one-shot or easily reversed.
 */
export function Controls() {
  const [kiosk, setKiosk] = useState(false);
  const [captureProtected, setCaptureProtected] = useState(false);
  const [clipboardLockdown, setClipboardLockdownState] = useState(false);
  const [displayCount, setDisplayCount] = useState<number | null>(null);
  const [connections, setConnections] = useState<NetworkConnection[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <div className="text-headline-sm">Advanced controls</div>
      <p className="mt-1 text-sm text-on-surface-variant">
        Individual toggles, useful for debugging one thing at a time.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* Not tinted — SessionConnect's "Connect" is this app's one
            primary action now (see its own comment). */}
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            run("kiosk", async () => {
              if (kiosk) await exitKioskWindow();
              else await enterKioskWindow();
              setKiosk(!kiosk);
            })
          }
        >
          {busy === "kiosk" ? "Working…" : kiosk ? "Exit kiosk window" : "Enter kiosk window"}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            run("capture", async () => {
              if (captureProtected) await disableCaptureProtection();
              else await enableCaptureProtection();
              setCaptureProtected(!captureProtected);
            })
          }
        >
          {busy === "capture" ? "Working…" : captureProtected ? "Disable capture protection" : "Enable capture protection"}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            run("clipboard-lockdown", async () => {
              await setClipboardLockdown(!clipboardLockdown);
              setClipboardLockdownState(!clipboardLockdown);
            })
          }
        >
          {busy === "clipboard-lockdown" ? "Working…" : clipboardLockdown ? "Disable clipboard lockdown" : "Enable clipboard lockdown"}
        </Button>

        <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => run("clear-clipboard", clearClipboardNow)}>
          {busy === "clear-clipboard" ? "Working…" : "Clear clipboard now"}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            run("displays", async () => {
              setDisplayCount(await getDisplayCount());
            })
          }
        >
          {busy === "displays" ? "Working…" : "Check display count"}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            run("connections", async () => {
              setConnections(await getActiveConnections());
            })
          }
        >
          {busy === "connections" ? "Working…" : "List active connections"}
        </Button>
      </div>

      {displayCount !== null ? (
        <p className="mt-3 text-sm text-on-surface-variant">
          {displayCount} display{displayCount === 1 ? "" : "s"} connected.
        </p>
      ) : null}
      {connections !== null ? (
        connections.length === 0 ? (
          <p className="mt-3 text-sm text-on-surface-variant">No established outbound connections.</p>
        ) : (
          <ul className="mt-3 space-y-1 rounded-md bg-surface-container px-3 py-2.5">
            {connections.map((c) => (
              <li key={`${c.pid}-${c.remoteIp}-${c.remotePort}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{c.processName}</span>
                <span className="shrink-0 font-mono text-on-surface-variant">
                  {c.remoteIp}:{c.remotePort}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {error ? <p className="mt-3 rounded bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p> : null}
    </Card>
  );
}
