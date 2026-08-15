import type { ProctoringEvent } from "@prisma/client";
import type { ProctoringEventType } from "@codeforge/shared";
import { prisma } from "../lib/prisma";

/**
 * Integrity Score (spec 3.5): a single 0–100 signal derived from weighted
 * proctoring-event severities. Explicitly a signal for human review, never an
 * automatic verdict: the UI must say so, and nothing auto-rejects on it
 * (the only automated action is the configured tab-switch/fullscreen
 * force-submit, which is a test rule, not a scoring decision).
 */

interface EventDef {
  severity: number; // 0 info ... 3 high, stored on the event row
  penalty: number; // deducted per occurrence
  cap: number; // max total deduction for this type
}

export const EVENT_DEFS: Record<ProctoringEventType, EventDef> = {
  tab_switch: { severity: 2, penalty: 4, cap: 40 },
  window_blur: { severity: 1, penalty: 1, cap: 8 },
  fullscreen_exit: { severity: 3, penalty: 6, cap: 30 },
  fullscreen_enter: { severity: 0, penalty: 0, cap: 0 },
  paste_blocked: { severity: 2, penalty: 3, cap: 15 },
  copy_blocked: { severity: 1, penalty: 1, cap: 5 },
  large_paste: { severity: 3, penalty: 8, cap: 24 },
  devtools_suspected: { severity: 3, penalty: 5, cap: 15 },
  multi_monitor: { severity: 2, penalty: 3, cap: 3 },
  webcam_denied: { severity: 3, penalty: 10, cap: 10 },
  face_absent: { severity: 2, penalty: 4, cap: 20 },
  // A second face in frame (a coach/proxy candidate) is a stronger signal
  // than plain absence, so it sits between face_absent and webcam_denied.
  multiple_faces_detected: { severity: 3, penalty: 8, cap: 24 },
  webcam_snapshot: { severity: 0, penalty: 0, cap: 0 },
  identity_snapshot: { severity: 0, penalty: 0, cap: 0 },
  integrity_auto_submit: { severity: 3, penalty: 0, cap: 0 }, // outcome, not extra penalty
  // Hardware/environment checks (EnvCheck, one-time). automation_browser and
  // virtual_camera also force-submit at strict/lockdown (see
  // IMMEDIATE_BLOCK_RULES in candidate.routes.ts) — their penalty here still
  // matters for sessions where the check only *flags* (lower proctoring
  // levels), so the score reflects it even without a hard block.
  vm_suspected: { severity: 2, penalty: 6, cap: 12 },
  virtual_camera_suspected: { severity: 3, penalty: 15, cap: 15 },
  automation_browser_suspected: { severity: 3, penalty: 20, cap: 20 },
  // Deliberately a token deduction only: this is a fuzzy, spoofable signal
  // and a legitimately weak-but-honest machine must not be meaningfully
  // penalized for it (spec: integrity signals never punish real candidates
  // for hardware they can't help).
  hardware_below_floor: { severity: 0, penalty: 1, cap: 3 },
  virtual_network_adapter: { severity: 1, penalty: 2, cap: 6 },
  // Continuous re-checks (candidate.routes.ts / proctoring.ts, session-long).
  // Flag-only, same rationale as their one-time counterparts: none of these
  // block, they just make sure the score reflects a change that happened
  // after the initial EnvCheck passed.
  multi_monitor_change: { severity: 2, penalty: 5, cap: 15 },
  device_list_changed: { severity: 2, penalty: 5, cap: 15 },
  resolution_changed: { severity: 1, penalty: 2, cap: 8 },
  long_idle: { severity: 0, penalty: 1, cap: 4 },
  // CodeForge Sentinel (native companion app) events — system-level signals
  // the browser can't see at all, so weighted higher than their closest
  // browser-side equivalents (e.g. sentinel_vm_detected vs vm_suspected).
  sentinel_process_violation: { severity: 3, penalty: 10, cap: 30 },
  sentinel_vm_detected: { severity: 3, penalty: 20, cap: 20 },
  sentinel_remote_desktop: { severity: 3, penalty: 25, cap: 25 },
  sentinel_screen_capture: { severity: 2, penalty: 8, cap: 24 },
  sentinel_clipboard_violation: { severity: 2, penalty: 5, cap: 15 },
  sentinel_network_anomaly: { severity: 2, penalty: 5, cap: 20 },
  sentinel_multi_monitor: { severity: 2, penalty: 3, cap: 3 },
  sentinel_hotkey_blocked: { severity: 1, penalty: 2, cap: 10 },
  sentinel_face_missing: { severity: 2, penalty: 4, cap: 20 },
  sentinel_face_multiple: { severity: 3, penalty: 8, cap: 24 },
  sentinel_integrity_drift: { severity: 2, penalty: 6, cap: 12 },
  sentinel_audio_anomaly: { severity: 1, penalty: 3, cap: 12 },
  sentinel_kiosk_breach: { severity: 3, penalty: 10, cap: 20 },
  // Outcome flag, not an extra penalty — mirrors integrity_auto_submit's
  // rationale (the missing-heartbeat gap itself is the signal).
  sentinel_heartbeat_lost: { severity: 3, penalty: 0, cap: 0 },
};

export function severityOf(type: ProctoringEventType): number {
  return EVENT_DEFS[type]?.severity ?? 1;
}

export interface IntegrityBreakdown {
  score: number;
  deductions: { type: string; count: number; deducted: number }[];
}

export function computeIntegrity(events: Pick<ProctoringEvent, "eventType">[]): IntegrityBreakdown {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.eventType, (counts.get(e.eventType) ?? 0) + 1);

  const deductions: IntegrityBreakdown["deductions"] = [];
  let total = 0;
  for (const [type, count] of counts) {
    const def = EVENT_DEFS[type as ProctoringEventType];
    if (!def || def.penalty === 0) continue;
    const deducted = Math.min(def.cap, def.penalty * count);
    if (deducted > 0) {
      deductions.push({ type, count, deducted });
      total += deducted;
    }
  }
  deductions.sort((a, b) => b.deducted - a.deducted);
  return { score: Math.max(0, 100 - total), deductions };
}

export async function computeSessionIntegrity(sessionId: string): Promise<IntegrityBreakdown> {
  const events = await prisma.proctoringEvent.findMany({
    where: { sessionId },
    select: { eventType: true },
  });
  return computeIntegrity(events);
}

/** Persist the score onto the session (called at finalize + after event batches). */
export async function refreshSessionIntegrity(sessionId: string): Promise<number> {
  const { score } = await computeSessionIntegrity(sessionId);
  await prisma.testSession.update({
    where: { id: sessionId },
    data: { integrityScore: score },
  });
  return score;
}
