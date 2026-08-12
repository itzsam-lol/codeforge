import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/** Global HQ notification feed. Fire-and-forget — see apps/api's copy for
 *  the identical rationale. */
export function notify(type: string, title: string, body: string, link?: string): void {
  prisma.hqNotification
    .create({ data: { type, title, body, link } })
    .catch((err) => logger.error({ err, type }, "[notify] failed to create notification"));
}
