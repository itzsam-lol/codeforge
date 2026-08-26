-- AlterTable
ALTER TABLE "ArenaParticipation" ADD COLUMN     "aiFlags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "chosenProctoringLevel" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "ratingMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "ArenaSubmission" ADD COLUMN     "selectedOptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "language" DROP NOT NULL,
ALTER COLUMN "code" DROP NOT NULL;
