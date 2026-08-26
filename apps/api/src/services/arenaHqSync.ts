import { config } from "../config";
import { logger } from "../lib/logger";

/**
 * Reverse leg of the HQ<->apps/api contest sync: once arenaRating.ts finishes
 * computing a contest's final standings, push them back to hq-api for the
 * staff analytics view. Fire-and-forget, same posture as
 * services/support.ts's syncNewTicketToHq — a failure here means HQ's
 * leaderboard view goes stale, not that rating computation (which already
 * succeeded locally) is rolled back.
 */

export interface ArenaStanding {
  userId: string;
  handle: string;
  name: string;
  score: number;
  penaltyMs: string; // BigInt serialized as string over the wire
  rank: number | null;
  ratingBefore: number | null;
  ratingAfter: number | null;
  chosenProctoringLevel?: string;
  aiFlags?: Record<string, unknown>[];
  reviewStatus?: string;
}

export function syncResultsToHq(contestId: string, standings: ArenaStanding[]): void {
  fetch(`${config.arenaHqApiUrl}/api/contests/${contestId}/results`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-arena-sync-secret": config.arenaSyncSecret },
    body: JSON.stringify({ standings }),
  }).catch((err) => logger.error({ err, contestId }, "[arena] results sync to HQ failed"));
}
