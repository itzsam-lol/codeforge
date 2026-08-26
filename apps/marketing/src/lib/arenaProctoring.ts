"use client";

/**
 * Real, client-side proctoring enforcement for Arena's compete/practice/demo
 * flows — ported in spirit from apps/web/src/lib/proctoring.ts's
 * useProctoring, but deliberately self-contained (no server-side event
 * pipeline/integrity-scoring backend): Arena has no analog to the client
 * product's ProctoringEvent/warning/force-submit system, and building one
 * was out of scope for this build. What's real and unchanged is the
 * detection itself — actual getUserMedia capture, actual
 * visibilitychange/blur/fullscreenchange listeners, actual copy/paste
 * blocking — surfaced directly to the UI as a live warning list rather than
 * being persisted server-side.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type ArenaProctoringLevel = "none" | "basic" | "strict" | "lockdown";

export interface ArenaProctoringEvent {
  type: string;
  at: number;
}

export function useArenaProctoring({
  level,
  active,
}: {
  level: ArenaProctoringLevel;
  active: boolean;
}) {
  const [events, setEvents] = useState<ArenaProctoringEvent[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== "undefined" ? Boolean(document.fullscreenElement) : false
  );
  const enabled = active && level !== "none";

  const report = useCallback((type: string) => {
    setEvents((prev) => [...prev.slice(-19), { type, at: Date.now() }]);
  }, []);

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

    let onCopy: ((e: ClipboardEvent) => void) | undefined;
    let onPaste: ((e: ClipboardEvent) => void) | undefined;
    if (level === "strict" || level === "lockdown") {
      onCopy = (e) => {
        e.preventDefault();
        report("copy_blocked");
      };
      onPaste = (e) => {
        e.preventDefault();
        report("paste_blocked");
      };
      document.addEventListener("copy", onCopy);
      document.addEventListener("paste", onPaste);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (onCopy) document.removeEventListener("copy", onCopy);
      if (onPaste) document.removeEventListener("paste", onPaste);
    };
  }, [enabled, level, report]);

  return { events, report, isFullscreen };
}

/** Acquires and holds a webcam stream, exposing a video ref the UI attaches
 *  to for a live preview — genuine getUserMedia capture, same as apps/web's
 *  useWebcamCapture. The periodic snapshot-upload loop itself is a separate
 *  hook below (useArenaSnapshotCapture) so EnvCheck can show a preview
 *  without necessarily uploading anything. */
export function useArenaWebcam({ enabled, onDenied }: { enabled: boolean; onDenied: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setActive(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => onDenied());
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { videoRef, active };
}

export function requestFullscreen(): Promise<void> {
  return document.documentElement.requestFullscreen?.() ?? Promise.resolve();
}

/**
 * Proctor-to-Earn: periodic snapshot capture + upload for a participant who
 * chose "webcam" or "lockdown". Mirrors apps/web/src/lib/proctoring.ts's
 * useWebcamCapture cadence exactly (random 45-90s interval + capture on
 * tab-return), POSTing to the Arena snapshot endpoint rather than storing
 * client-side. A failed upload is never fatal to the contest — same
 * best-effort posture as the client product's own snapshot loop.
 */
export function useArenaSnapshotCapture({
  slug,
  videoRef,
  enabled,
}: {
  slug: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const capture = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      const { arenaApi } = await import("./arenaApi");
      await arenaApi(`/api/arena/contests/${slug}/snapshot`, {
        method: "POST",
        body: { imageBase64: dataUrl },
      }).catch(() => undefined);
    };

    const schedule = () => {
      const delay = 45_000 + Math.random() * 45_000;
      timer = setTimeout(async () => {
        if (cancelled) return;
        await capture();
        schedule();
      }, delay);
    };

    const onVisible = () => {
      if (!document.hidden) void capture();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, slug]);
}
