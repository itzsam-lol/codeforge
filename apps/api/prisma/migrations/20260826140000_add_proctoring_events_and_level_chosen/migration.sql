-- AlterEnum
ALTER TYPE "ArenaParticipationStatus" ADD VALUE 'warned';

-- AlterTable
ALTER TABLE "ArenaParticipation"
  ADD COLUMN "proctoringLevelChosen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "proctoringEvents" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "strikeCount" INTEGER NOT NULL DEFAULT 0;
