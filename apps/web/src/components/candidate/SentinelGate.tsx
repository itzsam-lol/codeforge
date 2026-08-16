"use client";

/**
 * Phase 10: candidate-facing half of the requireSentinel setting. The
 * candidate can't reach StartCard until CodeForge Sentinel (apps/sentinel)
 * has sent at least one heartbeat for this session — /api/candidate/start
 * already enforces this server-side; this is the UI so a candidate isn't
 * left guessing why Start won't work.
 *
 * "Launch Sentinel" opens a codeforge-sentinel:// deep link carrying the API
 * origin + this candidate's own token (the same x-candidate-token the
 * browser itself uses — see apps/sentinel/src-tauri/src/services/
 * session_link.rs). There's no hosted installer download here: Sentinel
 * isn't code-signed or distributed yet (see apps/sentinel/README.md), so
 * this assumes the org has already gotten it onto the candidate's machine.
 */
import { useEffect, useRef, useState } from "react";
import { candidateApi } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { IconShield } from "@/components/icons";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000";
const POLL_MS = 3000;

interface ContextSessionShape {
  session: { sentinelConnected: boolean } | null;
}

export function SentinelGate({ token, onConnected }: { token: string; onConnected: () => void }) {
  const [checking, setChecking] = useState(true);
  const connectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const ctx = await candidateApi<ContextSessionShape>(token, "/api/candidate/context");
        if (cancelled) return;
        setChecking(false);
        if (ctx.session?.sentinelConnected && !connectedRef.current) {
          connectedRef.current = true;
          onConnected();
        }
      } catch {
        if (!cancelled) setChecking(false);
      }
    };
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const deepLink = `codeforge-sentinel://start?apiUrl=${encodeURIComponent(API_ORIGIN)}&token=${encodeURIComponent(token)}`;

  return (
    <Card className="p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <IconShield size={20} />
      </div>
      <h2 className="mt-4 text-sm font-semibold">CodeForge Sentinel required</h2>
      <p className="mt-1 text-xs text-on-surface-variant">
        This assessment requires the CodeForge Sentinel desktop app running before the test can
        start. If you already have it installed, click below to connect it to this session.
      </p>
      <a href={deepLink}>
        <Button className="mt-4 w-full">Launch Sentinel</Button>
      </a>
      <p className="mt-3 flex items-center gap-2 text-xs text-on-surface-variant">
        <span
          className={`h-1.5 w-1.5 rounded-full ${checking ? "animate-pulse bg-outline-variant" : "animate-pulse bg-accent"}`}
        />
        {checking ? "Checking connection…" : "Waiting for Sentinel to connect…"}
      </p>
      <p className="mt-3 text-xs text-on-surface-variant">
        Don&apos;t have Sentinel yet? Your recruiter can provide it — it&apos;s not published to a
        public download page.
      </p>
    </Card>
  );
}
