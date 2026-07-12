import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/**
 * Staff-action audit trail (spec 8 observability). Fire-and-forget: an audit
 * write failing must never block or fail the underlying action.
 */
export async function audit(
  orgId: string,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await prisma.auditLog
    .create({
      data: { orgId, actorId, action, targetType, targetId, metadata: metadata as Prisma.InputJsonValue },
    })
    .catch((err) => logger.error({ err, action, targetType, targetId }, "audit log write failed"));
}
