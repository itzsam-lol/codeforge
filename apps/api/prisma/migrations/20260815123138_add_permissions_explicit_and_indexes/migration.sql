-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "durationMultiplierPct" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "permissionsExplicit" BOOLEAN NOT NULL DEFAULT true;

-- Every account that existed before this migration keeps today's "empty
-- permissions array = unrestricted within role" behavior. Only accounts
-- created after this migration are held to the stricter explicit semantics.
UPDATE "User" SET "permissionsExplicit" = false;

-- CreateIndex
CREATE INDEX "Invitation_testId_isPreview_idx" ON "Invitation"("testId", "isPreview");

-- CreateIndex
CREATE INDEX "TestSession_testId_status_isPreview_idx" ON "TestSession"("testId", "status", "isPreview");
