import { prisma } from "../lib/prisma";
import { severityOf } from "./integrity";

export const HEARTBEAT_TIMEOUT_MS = 60_000;

/**
 * Repeatable sweep (queues.ts's ensureSentinelHeartbeatSweepJob): flags any
 * in-progress session that was using Sentinel (sentinelLastHeartbeatAt is
 * set — a plain browser-only session is never touched here) but hasn't
 * heartbeat in over 60s. One sentinel_heartbeat_lost event per lapse, not
 * per sweep tick — re-checks the most recent event's timestamp against the
 * current heartbeat gap so a recovered-then-lost-again session gets a fresh
 * flag instead of being silently ignored forever after the first one.
 */
export async function checkSentinelHeartbeats(): Promise<number> {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
  const stale = await prisma.testSession.findMany({
    where: {
      status: "in_progress",
      sentinelLastHeartbeatAt: { lt: cutoff, not: null },
    },
    select: { id: true, sentinelLastHeartbeatAt: true },
  });

  let flagged = 0;
  for (const session of stale) {
    const lastEvent = await prisma.proctoringEvent.findFirst({
      where: { sessionId: session.id, eventType: "sentinel_heartbeat_lost" },
      orderBy: { createdAt: "desc" },
    });
    // Already flagged for this exact lapse (no heartbeat has arrived since
    // that flag was written, or the session is still just as stale).
    if (lastEvent && session.sentinelLastHeartbeatAt && lastEvent.createdAt > session.sentinelLastHeartbeatAt) {
      continue;
    }
    await prisma.proctoringEvent.create({
      data: {
        sessionId: session.id,
        eventType: "sentinel_heartbeat_lost",
        severity: severityOf("sentinel_heartbeat_lost"),
        metadata: { lastHeartbeatAt: session.sentinelLastHeartbeatAt },
      },
    });
    flagged++;
  }
  return flagged;
}
