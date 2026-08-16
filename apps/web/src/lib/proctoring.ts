"use client";

/**
 * Candidate-side proctoring capture (Phase 2). Everything here is best-effort
 * observation; the server owns all enforcement and scoring. Signals are
 * batched and flushed every few seconds.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProctoringLevel } from "@codeforge/shared";
import { candidateApi } from "./api";
import { checkAutomationBrowser, checkVirtualDevices } from "./hardwareCheck";

export interface ProctoringConfig {
  level: ProctoringLevel;
  limits: { maxTabSwitches?: number; maxFullscreenExits?: number };
  webcamRequired: boolean;
  fullscreenRequired: boolean;
  sentinelRequired: boolean;
}

export interface IntegrityWarning {
  type: string;
  count: number;
  limit: number;
}

interface EventsResponse {
  forceSubmitted: boolean;
  warnings: IntegrityWarning[];
}

export function useProctoring({
  token,
  config,
  active,
  onForceSubmit,
}: {
  token: string;
  config: ProctoringConfig;
  active: boolean;
  onForceSubmit: () => void;
}) {
  const queue = useRef<{ type: string; metadata?: Record<string, unknown> }[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== "undefined" ? Boolean(document.fullscreenElement) : true
  );
  const [warnings, setWarnings] = useState<IntegrityWarning[]>([]);
  const devtoolsOpen = useRef(false);
  const enabled = active && config.level !== "none";

  const report = useCallback(
    (type: string, metadata?: Record<string, unknown>) => {
      if (config.level === "none") return;
      queue.current.push({ type, metadata });
    },
    [config.level]
  );

  // Flush loop
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const flush = async () => {
      if (stopped || queue.current.length === 0) return;
      const events = queue.current.splice(0, 50);
      try {
        const res = await candidateApi<EventsResponse>(token, "/api/candidate/events", {
          method: "POST",
          body: { events },
        });
        if (res.warnings?.length) setWarnings(res.warnings);
        if (res.forceSubmitted) onForceSubmit();
      } catch {
        queue.current.unshift(...events); // retry on next tick
      }
    };
    const id = setInterval(() => void flush(), 4000);
    return () => {
      stopped = true;
      clearInterval(id);
      void flush();
    };
  }, [enabled, token, onForceSubmit]);

  // Signal listeners
  useEffect(() => {
    if (!enabled) return;

    const onVisibility = () => {
      if (document.hidden) report("tab_switch");
    };
    const onBlur = () => {
      if (!document.hidden) report("window_blur");
    };
    const onFullscreenChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      report(fs ? "fullscreen_enter" : "fullscreen_exit");
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    setIsFullscreen(Boolean(document.fullscreenElement));

    // Multi-monitor (Window Management API, Chromium)
    const scr = window.screen as Screen & { isExtended?: boolean };
    let lastExtended = Boolean(scr.isExtended);
    if (lastExtended) report("multi_monitor");

    // Devtools heuristic (deterrent only: spec is explicit that client-side
    // lockdown can't be airtight; server-side validation is the real control)
    let devtoolsTimer: ReturnType<typeof setInterval> | undefined;
    if (config.level === "strict" || config.level === "lockdown") {
      devtoolsTimer = setInterval(() => {
        const gapW = window.outerWidth - window.innerWidth;
        const gapH = window.outerHeight - window.innerHeight;
        const open = gapW > 250 || gapH > 250;
        if (open && !devtoolsOpen.current) {
          devtoolsOpen.current = true;
          report("devtools_suspected");
        } else if (!open) {
          devtoolsOpen.current = false;
        }
      }, 5000);
    }

    // ---- Continuous re-checks: the environment can legitimately change
    // mid-session in ways the one-time EnvCheck can't catch (spec: "strengthen
    // browser-only signals" rather than pretend a native-app-level capture
    // detection is possible from a web page). All flag-only, same philosophy
    // as everything else in this file.

    // A display connected after the initial check passed.
    const monitorTimer = setInterval(() => {
      const extended = Boolean((window.screen as Screen & { isExtended?: boolean }).isExtended);
      if (extended && !lastExtended) report("multi_monitor_change");
      lastExtended = extended;
    }, 45_000);

    // Resolution changing mid-session (remote-desktop reconnect, display swap).
    let lastRes = `${window.screen.width}x${window.screen.height}`;
    const resTimer = setInterval(() => {
      const res = `${window.screen.width}x${window.screen.height}`;
      if (res !== lastRes) {
        report("resolution_changed", { from: lastRes, to: res });
        lastRes = res;
      }
    }, 30_000);

    // The device list changing at all mid-session is its own (lighter)
    // signal — report it unconditionally — separate from whether the new
    // device specifically matches known virtual-camera/mic software, which
    // is the heavier, more specific virtual_camera_suspected signal.
    // checkVirtualDevices() always returns type: "virtual_camera_suspected"
    // (it's written for that one purpose), so this must not just forward
    // result.type as "the" event or device_list_changed can never fire.
    const onDeviceChange = () => {
      report("device_list_changed");
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const result = checkVirtualDevices(devices);
          if (result.detected) report(result.type, result.detail ? { detail: result.detail } : undefined);
        })
        .catch(() => undefined);
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);

    // Re-run the automation-browser heuristic periodically rather than only
    // once at EnvCheck.
    const automationTimer = setInterval(() => {
      const result = checkAutomationBrowser();
      if (result.detected) report(result.type, result.detail ? { detail: result.detail } : undefined);
    }, 120_000);

    // Long idle: no pointer/keyboard activity for an extended window while
    // the timer is running. Soft context signal only, never blocking.
    let lastActivity = Date.now();
    let idleReported = false;
    const onActivity = () => {
      lastActivity = Date.now();
      idleReported = false;
    };
    const IDLE_THRESHOLD_MS = 4 * 60_000;
    const idleTimer = setInterval(() => {
      if (!idleReported && Date.now() - lastActivity > IDLE_THRESHOLD_MS) {
        idleReported = true;
        report("long_idle");
      }
    }, 30_000);
    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity, { passive: true });
    window.addEventListener("scroll", onActivity, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (devtoolsTimer) clearInterval(devtoolsTimer);
      clearInterval(monitorTimer);
      clearInterval(resTimer);
      clearInterval(automationTimer);
      clearInterval(idleTimer);
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
    };
  }, [enabled, config.level, report]);

  return { report, isFullscreen, warnings };
}

// ---------------------------------------------------------------------------
// Webcam capture
// ---------------------------------------------------------------------------

/**
 * Best-effort face count via the experimental FaceDetector API (Chromium
 * only; returns null everywhere else, same graceful-degradation as the rest
 * of this file). Capped at 2 — the server only needs to distinguish
 * "none" / "one" / "more than one," not an exact count.
 */
async function detectFaces(video: HTMLVideoElement): Promise<number | null> {
  try {
    const FD = (window as unknown as { FaceDetector?: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<unknown[]> } })
      .FaceDetector;
    if (!FD) return null;
    const faces = await new FD({ fastMode: true, maxDetectedFaces: 2 }).detect(video);
    return faces.length;
  } catch {
    return null;
  }
}

export async function captureSnapshot(
  token: string,
  video: HTMLVideoElement,
  kind: "identity" | "interval" | "event"
): Promise<void> {
  if (video.readyState < 2 || video.videoWidth === 0) return;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 640 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
  const facesDetected = await detectFaces(video);
  const facePresent = facesDetected === null ? null : facesDetected > 0;
  await candidateApi(token, "/api/candidate/snapshot", {
    method: "POST",
    body: { imageBase64: dataUrl, facePresent, facesDetected, kind },
  }).catch(() => undefined); // snapshot loss is never fatal for the candidate
}

/**
 * Keeps a hidden webcam stream alive during the test and uploads snapshots at
 * random 45–90s intervals plus whenever the tab regains visibility.
 */
export function useWebcamCapture({
  token,
  enabled,
  onDenied,
}: {
  token: string;
  enabled: boolean;
  onDenied: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const delay = 45_000 + Math.random() * 45_000;
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (videoRef.current) await captureSnapshot(token, videoRef.current, "interval");
        schedule();
      }, delay);
    };

    const onVisible = () => {
      if (!document.hidden && videoRef.current) {
        void captureSnapshot(token, videoRef.current, "event");
      }
    };

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
        schedule();
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch(() => onDenied());

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token]);

  return { videoRef };
}
