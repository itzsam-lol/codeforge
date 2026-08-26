-- AlterTable: add slug nullable first so existing rows (already-synced
-- contests) aren't rejected, then backfill from the JSON payload every row
-- already carries, then tighten to NOT NULL + UNIQUE.
ALTER TABLE "ArenaContestCache" ADD COLUMN "slug" TEXT;

UPDATE "ArenaContestCache" SET "slug" = "payload"->>'slug' WHERE "slug" IS NULL;

ALTER TABLE "ArenaContestCache" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ArenaContestCache_slug_key" ON "ArenaContestCache"("slug");
