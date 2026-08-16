import { useState } from "react";
import {
  clearClipboardNow,
  disableCaptureProtection,
  enableCaptureProtection,
  enterKioskWindow,
  exitKioskWindow,
  getDisplayCount,
  setClipboardLockdown,
} from "@/lib/tauri";
import { Button, Card } from "./ui";

/**
 * Manual controls for the phases that don't yet have an automatic trigger
 * (no real test-taking flow exists here — that's Phase 10, reusing
 * apps/web's TestRunner). Everything wired up here is safe to click: kiosk
 * fullscreen is fully reversible, capture protection only affects this
 * window's own screenshots, clipboard actions are one-shot or easily
 * reversed. The global hotkey-block hook (kiosk.rs) is deliberately NOT
 * exposed here — see its doc comment.
 */
export function Controls() {
  const [kiosk, setKiosk] = useState(false);
  const [captureProtected, setCaptureProtected] = useState(false);
  const [clipboardLockdown, setClipboardLockdownState] = useState(false);
  const [displayCount, setDisplayCount] = useState<number | null>(null);
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
      <div className="text-headline-sm">Controls</div>
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
      </div>

      {displayCount !== null ? (
        <p className="mt-3 text-xs text-on-surface-variant">
          {displayCount} display{displayCount === 1 ? "" : "s"} connected.
        </p>
      ) : null}
      {error ? <p className="mt-3 rounded bg-bad-bg px-3 py-2 text-xs text-bad">{error}</p> : null}
    </Card>
  );
}
