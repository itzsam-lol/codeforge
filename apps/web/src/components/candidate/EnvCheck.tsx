"use client";

/**
 * Pre-test environment & permission check (spec 3.4.2). Explains WHY each
 * permission is needed before asking — transparency reduces candidate anxiety
 * and is the ethically correct approach (spec 3.5).
 */
import { useEffect, useRef, useState } from "react";
import { candidateApi } from "@/lib/api";
import { captureSnapshot, type ProctoringConfig } from "@/lib/proctoring";
import { Button, Card, cn } from "@/components/ui";
import { IconCheck, IconX } from "@/components/icons";

type CheckState = "pending" | "pass" | "fail";

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

  async function takeIdentityShot() {
    if (!videoRef.current) return;
    setBusy(true);
    await captureSnapshot(token, videoRef.current, "identity");
    setSnapDone(true);
    setBusy(false);
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
            why: "Permission check only — audio is NOT recorded.",
            state: mic,
          },
        ]
      : []),
  ];

  const required = config.webcamRequired
    ? browser === "pass" && fullscreen === "pass" && camera === "pass" && snapDone
    : browser === "pass" && fullscreen === "pass";

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold">Environment check</h2>
      <p className="mt-1 text-xs text-slate-500">
        This test uses proctoring level <b>{config.level}</b>. Here is exactly what each
        permission is used for:
      </p>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white transition-colors",
                row.state === "pass" ? "bg-emerald-500" : row.state === "fail" ? "bg-rose-500" : "bg-slate-300"
              )}
            >
              {row.state === "pass" ? (
                <IconCheck size={12} strokeWidth={3} />
              ) : row.state === "fail" ? (
                <IconX size={12} strokeWidth={3} />
              ) : (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              )}
            </span>
            <div>
              <div className="text-sm font-medium">{row.label}</div>
              <div className="text-xs text-slate-500">{row.why}</div>
            </div>
          </div>
        ))}
      </div>

      {config.webcamRequired ? (
        <div className="mt-4">
          <video ref={videoRef} muted playsInline className="h-40 rounded-lg bg-slate-900 object-cover" />
          {camera === "pass" && !snapDone ? (
            <Button size="sm" variant="secondary" className="mt-2" onClick={takeIdentityShot} disabled={busy}>
              {busy ? "Capturing…" : "Capture identity photo"}
            </Button>
          ) : snapDone && camera === "pass" ? (
            <p className="mt-2 text-xs text-emerald-700">Identity photo captured.</p>
          ) : null}
        </div>
      ) : null}

      {rows.some((r) => r.state === "fail") ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          A required check failed. Fix it (allow permissions, use a desktop browser) and reload
          this page — or contact the recruiter if you can&apos;t.
        </p>
      ) : null}

      <Button className="mt-4 w-full" disabled={!required} onClick={onReady}>
        Continue
      </Button>
    </Card>
  );
}
