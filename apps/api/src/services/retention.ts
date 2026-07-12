import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { config } from "../config";
import { deleteObject } from "../lib/s3";

const SNAPSHOT_EVENT_TYPES = ["webcam_snapshot", "identity_snapshot"] as const;

/**
 * Retention sweep (spec 8 privacy): deletes webcam/identity snapshot images
 * older than SNAPSHOT_RETENTION_DAYS from object storage. The proctoring-
 * timeline entry itself is kept (with the storage key stripped and
 * `purged: true` set) so the record that a check happened survives; only the
 * image does not. A `0` setting disables the sweep entirely.
 */
export async function purgeExpiredSnapshots(): Promise<number> {
  if (config.snapshotRetentionDays === 0) return 0;
  const cutoff = new Date(Date.now() - config.snapshotRetentionDays * 24 * 60 * 60 * 1000);

  const events = await prisma.proctoringEvent.findMany({
    where: { eventType: { in: [...SNAPSHOT_EVENT_TYPES] }, createdAt: { lt: cutoff } },
    select: { id: true, metadata: true },
  });

  let purged = 0;
  for (const e of events) {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    const key = meta.key;
    if (typeof key !== "string") continue; // already purged or never had media
    try {
      await deleteObject(key);
      const { key: _key, ...rest } = meta;
      await prisma.proctoringEvent.update({
        where: { id: e.id },
        data: { metadata: { ...rest, purged: true } as Prisma.InputJsonValue },
      });
      purged++;
    } catch (err) {
      logger.error({ err, eventId: e.id }, "snapshot retention delete failed");
    }
  }
  return purged;
}
