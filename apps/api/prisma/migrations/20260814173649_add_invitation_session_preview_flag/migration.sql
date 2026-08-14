-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "isPreview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TestSession" ADD COLUMN     "isPreview" BOOLEAN NOT NULL DEFAULT false;
