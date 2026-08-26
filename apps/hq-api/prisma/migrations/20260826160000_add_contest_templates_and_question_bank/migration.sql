-- AlterTable
ALTER TABLE "contest" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "question_bank_item" (
    "id" TEXT NOT NULL,
    "type" "ArenaQuestionType" NOT NULL DEFAULT 'coding',
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "difficulty" "ArenaDifficulty" NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "editorial" TEXT,
    "typeConfig" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_bank_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_bank_item_type_difficulty_idx" ON "question_bank_item"("type", "difficulty");

-- AddForeignKey
ALTER TABLE "question_bank_item" ADD CONSTRAINT "question_bank_item_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "hq_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
