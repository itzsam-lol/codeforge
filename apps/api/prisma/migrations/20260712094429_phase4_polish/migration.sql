-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "resultsNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TestSession" ADD COLUMN     "shortlisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
