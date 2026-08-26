"use client";

/**
 * Real, client-side proctoring enforcement for Arena's compete/practice/demo
 * flows — ported in spirit from apps/web/src/lib/proctoring.ts's
 * useProctoring. Detection is real: actual getUserMedia capture, actual
 * visibilitychange/blur/fullscreenchange listeners, actual copy/paste
 * blocking. As of BUG-6, detected events are also batched and sent to the
 * server every 15s (POST .../proctoring-events) when a contestSlug is
 * given, so violations are permanently recorded and strike-counted instead
 * of only ever living in this hook's React state — practice/demo mode
 * passes no contestSlug and stays purely local, matching its "no
 * competitive integrity at stake" posture.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type ArenaProctoringLevel = "none" | "basic" | "strict" | "lockdown";

export interface ArenaProctoringEvent {
  type: string;
  at: number;
}

const EVENT_BATCH_INTERVAL_MS = 15_000;

export function useArenaProctoring({
  level,
  active,
  contestSlug,
}: {
  level: ArenaProctoringLevel;
  active: boolean;
  /** Omit for practice/demo mode — no server-side recording without a real contest. */
  contestSlug?: string;
}) {
  const [events, setEvents] = useState<ArenaProctoringEvent[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== "undefined" ? Boolean(document.fullscreenElement) : false
  );
  const [strikeCount, setStrikeCount] = useState(0);
  const [maxStrikes, setMaxStrikes] = useState<number | null>(null);
  const [participationStatus, setParticipationStatus] = useState<string | null>(null);
  const enabled = active && level !== "none";
  const pendingRef = useRef<ArenaProctoringEvent[]>([]);

  const report = useCallback((type: string) => {
    const event = { type, at: Date.now() };
    setEvents((prev) => [...prev.slice(-19), event]);
    pendingRef.current.push(event);
  }, []);

  // Flush whatever's pending every 15s — a fresh interval per contestSlug/
  // enabled combo so a stale closure never sends to the wrong contest.
  useEffect(() => {
    if (!enabled || !contestSlug) return;
    const id = setInterval(() => {
      if (pendingRef.current.length === 0) return;
      const batch = pendingRef.current;
      pendingRef.current = [];
      void (async () => {
        try {
          const { arenaApi } = await import("./arenaApi");
          const res = await arenaApi<{ strikeCount: number; maxStrikes: number; status: string }>(
            `/api/arena/contests/${contestSlug}/proctoring-events`,
            { method: "POST", body: { events: batch } }
          );
          setStrikeCount(res.strikeCount);
          setMaxStrikes(res.maxStrikes);
          setParticipationStatus(res.status);
        } catch {
          // Best-effort — put the batch back so the next tick retries it
          // rather than silently losing violations on a transient failure.
          pendingRef.current = [...batch, ...pendingRef.current];
        }
      })();
    }, EVENT_BATCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, contestSlug]);

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

  return { events, report, isFullscreen, strikeCount, maxStrikes, participationStatus };
}

/** Acquires and holds a webcam stream, exposing a video ref the UI attaches
 *  to for a live preview — genuine getUserMedia capture, same as apps/web's
 *  useWebcamCapture. The periodic snapshot-upload loop itself is a separate
 *  hook below (useArenaSnapshotCapture) so EnvCheck can show a preview
 *  without necessarily uploading anything. */
const WEBCAM_HEARTBEAT_INTERVAL_MS = 60_000;
const WEBCAM_LOST_AFTER_MISSES = 2; // 2 consecutive misses = 2 minutes with no frame

export function useArenaWebcam({
  enabled,
  onDenied,
  onFrameLost,
}: {
  enabled: boolean;
  onDenied: () => void;
  /** Called once when no video frame has been readable for
   *  WEBCAM_HEARTBEAT_INTERVAL_MS * WEBCAM_LOST_AFTER_MISSES (BUG-6 #5). */
  onFrameLost?: () => void;
}) {
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

  // Heartbeat: a readable frame (dimensions known, track live) resets the
  // miss counter; consecutive misses mean the camera stopped producing
  // frames without the stream itself ever formally ending (a disconnected
  // USB webcam, an OS-level permission yanked mid-session, etc — cases a
  // plain "stream active" check wouldn't catch).
  useEffect(() => {
    if (!enabled || !onFrameLost) return;
    let misses = 0;
    let reported = false;
    const id = setInterval(() => {
      const video = videoRef.current;
      const track = streamRef.current?.getVideoTracks()[0];
      const frameOk = Boolean(video && video.videoWidth > 0 && track && track.readyState === "live" && !track.muted);
      if (frameOk) {
        misses = 0;
        reported = false;
        return;
      }
      misses += 1;
      if (misses >= WEBCAM_LOST_AFTER_MISSES && !reported) {
        reported = true;
        onFrameLost();
      }
    }, WEBCAM_HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, onFrameLost]);

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
