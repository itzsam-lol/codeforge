"use client";

/**
 * Pre-test environment & permission check (spec 3.4.2). Explains WHY each
 * permission is needed before asking: transparency reduces candidate anxiety
 * and is the ethically correct approach (spec 3.5).
 *
 * Also runs the one-time hardware/environment integrity checks
 * (apps/web/src/lib/hardwareCheck.ts): most are informational and feed the
 * Integrity Score as a flag, never blocking Continue. Two are hard blocks
 * (automation_browser_suspected always; virtual_camera_suspected only at
 * lockdown) per HARD_BLOCK_EVENT_LEVELS — blocked here, before the timed
 * session ever starts, rather than letting the candidate start and get
 * force-submitted mid-test.
 */
import { useEffect, useRef, useState } from "react";
import { HARD_BLOCK_EVENT_LEVELS, type ProctoringEventType } from "@codeforge/shared";
import { candidateApi } from "@/lib/api";
import { captureSnapshot, type ProctoringConfig } from "@/lib/proctoring";
import { runHardwareChecks, type HardwareCheckResult } from "@/lib/hardwareCheck";
import { Button, Card, cn } from "@/components/ui";
import { IconCheck, IconX, IconAlert } from "@/components/icons";

type CheckState = "pending" | "pass" | "fail" | "flag";

const HW_LABELS: Partial<Record<ProctoringEventType, string>> = {
  vm_suspected: "Virtual machine check",
  virtual_camera_suspected: "Virtual camera/mic check",
  automation_browser_suspected: "Automation check",
  hardware_below_floor: "Hardware performance",
  virtual_network_adapter: "Network adapter check",
};

const HW_WHY: Partial<Record<ProctoringEventType, string>> = {
  vm_suspected: "A best-effort check for virtual-machine graphics drivers. Purely informational.",
  virtual_camera_suspected: "Checks for known virtual-camera/microphone software instead of a real device.",
  automation_browser_suspected: "Checks that this is a regular browser, not a scripted/automated one.",
  hardware_below_floor: "A quick performance estimate so we can warn you if the test may run slowly, never a failure.",
  virtual_network_adapter: "A best-effort check for unusual virtual network adapters. Purely informational.",
};

export function EnvCheck({
  token,
  config,
  onReady,
}: {
  token: string;
  config: ProctoringConfig;
  onReady: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [browser, setBrowser] = useState<CheckState>("pending");
  const [fullscreen, setFullscreen] = useState<CheckState>("pending");
  const [camera, setCamera] = useState<CheckState>(config.webcamRequired ? "pending" : "pass");
  const [mic, setMic] = useState<CheckState>(config.webcamRequired ? "pending" : "pass");
  const [snapDone, setSnapDone] = useState(!config.webcamRequired);
  const [busy, setBusy] = useState(false);
  const [hwResults, setHwResults] = useState<HardwareCheckResult[] | null>(null);

  useEffect(() => {
    // Browser: desktop viewport + not an obvious mobile UA.
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    setBrowser(!mobile && window.innerWidth >= 900 ? "pass" : "fail");
    // Fullscreen capability (older/embedded browsers may lack the API).
    setFullscreen(
      typeof document.documentElement.requestFullscreen === "function" ? "pass" : "fail"
    );

    if (config.webcamRequired) {
      navigator.mediaDevices
        .getUserMedia({ video: { width: 640 }, audio: true })
        .then((stream) => {
          streamRef.current = stream;
          setCamera("pass");
          setMic(stream.getAudioTracks().length > 0 ? "pass" : "fail");
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => undefined);
          }
        })
        .catch(() => {
          setCamera("fail");
          setMic("fail");
          // Denial is itself a logged signal.
          void candidateApi(token, "/api/candidate/events", {
            method: "POST",
            body: { events: [{ type: "webcam_denied" }] },
          }).catch(() => undefined);
        });
    }
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Device labels are only populated once a getUserMedia grant exists;
      // enumerateDevices() still resolves without one, just with blank
      // labels, so the virtual-device-name check is a silent no-op in that
      // case rather than an error.
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const results = await runHardwareChecks(devices);
      if (cancelled) return;
      setHwResults(results);
      const detected = results.filter((r) => r.detected);
      if (detected.length > 0) {
        void candidateApi(token, "/api/candidate/events", {
          method: "POST",
          body: { events: detected.map((r) => ({ type: r.type, metadata: r.detail ? { detail: r.detail } : undefined })) },
        }).catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function takeIdentityShot() {
    if (!videoRef.current) return;
    setBusy(true);
    await captureSnapshot(token, videoRef.current, "identity");
    setSnapDone(true);
    setBusy(false);
  }

  function blocksAt(type: ProctoringEventType): boolean {
    return HARD_BLOCK_EVENT_LEVELS[type]?.includes(config.level) ?? false;
  }

  const hwRows: { label: string; why: string; state: CheckState }[] = (hwResults ?? [])
    .filter((r) => r.type !== "virtual_camera_suspected" || config.webcamRequired)
    .map((r) => ({
      label: HW_LABELS[r.type] ?? r.type,
      why: HW_WHY[r.type] ?? "",
      state: r.detected ? (blocksAt(r.type) ? "fail" : "flag") : "pass",
    }));
  if (hwResults === null) {
    hwRows.push({ label: "Automation check", why: HW_WHY.automation_browser_suspected!, state: "pending" });
  }

  const rows: { label: string; why: string; state: CheckState }[] = [
    { label: "Desktop browser", why: "The coding workspace needs a desktop-sized screen.", state: browser },
    { label: "Fullscreen support", why: "The test runs in fullscreen; exits are logged.", state: fullscreen },
    ...(config.webcamRequired
      ? [
          {
            label: "Camera",
            why: "Snapshots are taken at random moments during the test for the reviewing team. No continuous video is recorded.",
            state: camera,
          },
          {
            label: "Microphone",
            why: "Permission check only, audio is NOT recorded.",
            state: mic,
          },
        ]
      : []),
    ...hwRows,
  ];

  const hasHardBlock = (hwResults ?? []).some((r) => r.detected && blocksAt(r.type));
  const required = (
    config.webcamRequired
      ? browser === "pass" && fullscreen === "pass" && camera === "pass" && snapDone
      : browser === "pass" && fullscreen === "pass"
  ) && !hasHardBlock;

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold">Environment check</h2>
      <p className="mt-1 text-xs text-on-surface-variant">
        This test uses proctoring level <b>{config.level}</b>. Here is exactly what each
        permission and check is used for:
      </p>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-3 rounded-md bg-surface-container px-3 py-2">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white transition-colors duration-150",
                row.state === "pass"
                  ? "bg-ok"
                  : row.state === "fail"
                    ? "bg-bad"
                    : row.state === "flag"
                      ? "bg-warn"
                      : "bg-outline-variant"
              )}
            >
              {row.state === "pass" ? (
                <IconCheck size={12} strokeWidth={3} />
              ) : row.state === "fail" ? (
                <IconX size={12} strokeWidth={3} />
              ) : row.state === "flag" ? (
                <IconAlert size={12} strokeWidth={3} />
              ) : (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              )}
            </span>
            <div>
              <div className="text-sm font-medium">{row.label}</div>
              <div className="text-xs text-on-surface-variant">{row.why}</div>
            </div>
          </div>
        ))}
      </div>

      {config.webcamRequired ? (
        <div className="mt-4">
          <video ref={videoRef} muted playsInline className="h-40 rounded-md bg-slate-900 object-cover" />
          {camera === "pass" && !snapDone ? (
            <Button size="sm" variant="secondary" className="mt-2" onClick={takeIdentityShot} disabled={busy}>
              {busy ? "Capturing…" : "Capture identity photo"}
            </Button>
          ) : snapDone && camera === "pass" ? (
            <p className="mt-2 text-xs text-ok">Identity photo captured.</p>
          ) : null}
        </div>
      ) : null}

      {rows.some((r) => r.state === "fail") ? (
        <p className="mt-3 rounded-md bg-bad-bg px-3 py-2 text-xs text-bad">
          {hasHardBlock
            ? "This device or browser failed a required integrity check and can't continue to this test. Contact the recruiter if you believe this is a mistake."
            : "A required check failed. Fix it (allow permissions, use a desktop browser) and reload this page, or contact the recruiter if you can't."}
        </p>
      ) : rows.some((r) => r.state === "flag") ? (
        <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-xs text-warn">
          One or more checks flagged something for the reviewing team's awareness. This does not
          block you from continuing.
        </p>
      ) : null}

      <Button className="mt-4 w-full" disabled={!required} onClick={onReady}>
        Continue
      </Button>
    </Card>
  );
}
