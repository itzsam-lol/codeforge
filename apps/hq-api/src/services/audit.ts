import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/**
 * Staff-action audit trail, mirroring apps/api/src/services/audit.ts.
 * Fire-and-forget: an audit write failing must never block or fail the
 * underlying action.
 */
export async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await prisma.hqAuditLog
    .create({
      data: { actorId, action, targetType, targetId, metadata: metadata as Prisma.InputJsonValue },
    })
    .catch((err) => logger.error({ err, action, targetType, targetId }, "hq audit log write failed"));
}
