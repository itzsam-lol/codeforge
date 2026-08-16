import { config } from "../config";
import { logger } from "../lib/logger";

/**
 * Best-effort dual-write of codeforge-channel support tickets/messages into
 * HQ's own database (apps/hq-api has a mirrored SupportTicket/SupportMessage
 * pair, see its schema.prisma). Mirrors apps/marketing's lead-ingest dual-write
 * into HQ exactly: fire-and-forget, HQ_API_URL + a shared secret header,
 * never awaited by the caller and never throws — a sync failure means HQ's
 * copy goes stale, not that ticket creation/reply fails for the org or
 * candidate. Silently a no-op if HQ_API_URL/HQ_SUPPORT_INGEST_SECRET/HQ_CLIENT_ID
 * aren't configured (e.g. local dev, or a deployment that hasn't been linked
 * to an HQ client yet).
 */

interface SyncTicketPayload {
  originTicketId: string;
  subject: string;
  candidateEmail: string | null;
  candidateName: string | null;
  firstMessage: { authorType: string; authorName: string; body: string };
}

export function syncNewTicketToHq(payload: SyncTicketPayload): void {
  const { hqApiUrl, hqSupportIngestSecret, hqClientId } = config;
  if (!hqApiUrl || !hqSupportIngestSecret || !hqClientId) return;

  fetch(`${hqApiUrl}/api/support-tickets/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hq-support-secret": hqSupportIngestSecret },
    // originApiUrl: where HQ sends replies back to (this deployment's own
    // /api/support-tickets/ingest/messages) — stored on HQ's mirrored row
    // directly rather than looked up via Client.provisioningTarget, so a
    // reply never depends on that relationship existing or staying in sync.
    body: JSON.stringify({ clientId: hqClientId, originApiUrl: config.webOrigin, ...payload }),
  }).catch((err) => logger.error({ err, originTicketId: payload.originTicketId }, "[support] HQ ticket sync failed"));
}

interface SyncMessagePayload {
  originTicketId: string;
  authorType: string;
  authorName: string;
  body: string;
}

export function syncMessageToHq(payload: SyncMessagePayload): void {
  const { hqApiUrl, hqSupportIngestSecret, hqClientId } = config;
  if (!hqApiUrl || !hqSupportIngestSecret || !hqClientId) return;

  fetch(`${hqApiUrl}/api/support-tickets/ingest/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hq-support-secret": hqSupportIngestSecret },
    body: JSON.stringify({ clientId: hqClientId, ...payload }),
  }).catch((err) => logger.error({ err, originTicketId: payload.originTicketId }, "[support] HQ message sync failed"));
}

/**
 * The GDPR erasure counterpart to syncNewTicketToHq: deletes this
 * candidate's mirrored ticket(s) from HQ's own database, which this
 * deployment's own DELETE FROM SupportTicket can never reach. Awaited (not
 * fire-and-forget like the sync functions above) so gdpr.routes.ts's
 * summary and audit-log entry reflect whether it actually happened — but
 * still best-effort: a failure here shouldn't abort local erasure, which
 * already succeeded by the time this runs. Silently a no-op under the same
 * conditions the sync functions are (HQ not configured for this deployment).
 */
export async function deleteCandidateDataFromHq(candidateEmail: string): Promise<number> {
  const { hqApiUrl, hqSupportIngestSecret, hqClientId } = config;
  if (!hqApiUrl || !hqSupportIngestSecret || !hqClientId) return 0;

  try {
    const res = await fetch(`${hqApiUrl}/api/support-tickets/ingest/candidate-data`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-hq-support-secret": hqSupportIngestSecret },
      body: JSON.stringify({ clientId: hqClientId, candidateEmail }),
    });
    if (!res.ok) throw new Error(`HQ responded ${res.status}`);
    const body = (await res.json()) as { ticketsDeleted: number };
    return body.ticketsDeleted;
  } catch (err) {
    logger.error({ err, candidateEmail }, "[support] HQ candidate-data erasure failed");
    return 0;
  }
}
