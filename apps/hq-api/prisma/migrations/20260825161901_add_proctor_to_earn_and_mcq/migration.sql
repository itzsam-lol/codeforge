-- CreateEnum
CREATE TYPE "ArenaQuestionType" AS ENUM ('coding', 'mcq');

-- AlterTable
ALTER TABLE "contest" ADD COLUMN     "lockdownBonusPct" DOUBLE PRECISION NOT NULL DEFAULT 35,
ADD COLUMN     "webcamBonusPct" DOUBLE PRECISION NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "contest_question" ADD COLUMN     "aiPromptUsed" TEXT,
ADD COLUMN     "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "ArenaQuestionType" NOT NULL DEFAULT 'coding';
