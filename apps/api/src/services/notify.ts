import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/**
 * Org-wide notification feed. Fire-and-forget, same posture as every other
 * best-effort side effect in this codebase (email dispatch, HQ sync) — a
 * failure here must never fail the request that triggered it.
 */
export function notify(orgId: string, type: string, title: string, body: string, link?: string): void {
  prisma.notification
    .create({ data: { orgId, type, title, body, link } })
    .catch((err) => logger.error({ err, orgId, type }, "[notify] failed to create notification"));
}
