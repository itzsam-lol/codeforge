import { useState } from "react";
import {
  disableCaptureProtection,
  enableCaptureProtection,
  enterKioskWindow,
  exitKioskWindow,
  installHotkeyLock,
  setClipboardLockdown,
  uninstallHotkeyLock,
} from "@/lib/tauri";
import { Badge, Button, Card } from "./ui";
import { IconAlert, IconShield } from "./icons";

/**
 * The real lockdown sequence: fullscreen kiosk window + the global
 * Alt-Tab/Alt-F4/Win/PrintScreen hotkey block (kiosk.rs) + clipboard
 * lockdown + capture protection, started/stopped together as one unit.
 *
 * Escape hatch: "End Lockdown" below is rendered INSIDE the locked-down
 * window itself and reachable by mouse click alone — the hotkey hook only
 * ever swallows specific Alt/Win/PrintScreen combinations, never plain
 * mouse input or an unmodified click, so this button is never blocked by
 * the very lock it's meant to end. If any step in `start` fails partway,
 * already-completed steps are unwound in reverse before surfacing the
 * error, so a failed start never leaves a partial lockdown behind.
 */
export function LockdownControl({
  ready,
  blockedReasons,
  practiceMode = false,
  onActiveChange,
}: {
  ready: boolean;
  blockedReasons: string[];
  practiceMode?: boolean;
  onActiveChange?: (active: boolean) => void;
}) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const completed: Array<() => Promise<unknown>> = [];
    try {
      await enterKioskWindow();
      completed.push(exitKioskWindow);
      await installHotkeyLock();
      completed.push(uninstallHotkeyLock);
      await setClipboardLockdown(true);
      completed.push(() => setClipboardLockdown(false));
      await enableCaptureProtection();
      completed.push(disableCaptureProtection);
      setActive(true);
      onActiveChange?.(true);
    } catch (err) {
      for (const undo of completed.reverse()) {
        await undo().catch(() => undefined);
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    setBusy(true);
    // Best-effort, every step runs regardless of earlier failures — a
    // partially-reversed lockdown is worse than a slow one.
    await disableCaptureProtection().catch(() => undefined);
    await setClipboardLockdown(false).catch(() => undefined);
    await uninstallHotkeyLock().catch(() => undefined);
    await exitKioskWindow().catch(() => undefined);
    setActive(false);
    onActiveChange?.(false);
    setBusy(false);
  }

  if (active) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface">
        <div className="cf-grid-mesh pointer-events-none absolute inset-0" aria-hidden />
        <Card className="cf-scale-in relative z-[1] mx-4 max-w-sm p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok-bg text-ok">
            <IconShield size={24} />
          </div>
          <h1 className="mt-3 text-headline-sm">Lockdown active</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            {practiceMode
              ? "This is a practice run — nothing is being recorded. Fullscreen, hotkey blocking, clipboard lockdown, and capture protection are all live so you can see exactly what test day feels like."
              : "Fullscreen, hotkey blocking, clipboard lockdown, and capture protection are all active for this session."}
          </p>
          {error ? <p className="mt-3 rounded bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p> : null}
          <Button variant="secondary" className="mt-4 w-full" disabled={busy} onClick={() => void end()}>
            {busy ? "Ending…" : "End lockdown"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-headline-sm">Lockdown</span>
        <Badge color={ready ? "ok" : "neutral"} dashed={!ready}>
          {ready ? "Ready" : "Not ready"}
        </Badge>
      </div>

      <p className="mt-3 text-sm text-on-surface-variant">
        Starting lockdown enters fullscreen, blocks Alt-Tab / Alt-F4 / the Windows key / PrintScreen
        system-wide, clears the clipboard on any change, and hides this window from screen capture.
        You can end it at any time from the button inside the locked screen.
      </p>

      {!ready && blockedReasons.length > 0 ? (
        <ul className="mt-3 space-y-1.5 rounded-md bg-surface-container px-3 py-2.5">
          {blockedReasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-sm text-on-surface-variant">
              <IconAlert size={14} className="mt-0.5 shrink-0 text-warn" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-3 rounded bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p> : null}

      <Button className="mt-4 w-full" disabled={!ready || busy} onClick={() => void start()}>
        {busy ? "Starting…" : "Start lockdown"}
      </Button>
    </Card>
  );
}
