-- AlterTable
ALTER TABLE "PlagiarismReport" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'candidate',
ADD COLUMN     "referenceLabel" TEXT,
ALTER COLUMN "comparedSubmissionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EditorEventBatch" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "ops" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorEventBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditorEventBatch_sessionId_questionId_seq_idx" ON "EditorEventBatch"("sessionId", "questionId", "seq");

-- CreateIndex
CREATE INDEX "PlagiarismReport_comparedSubmissionId_idx" ON "PlagiarismReport"("comparedSubmissionId");

-- AddForeignKey
ALTER TABLE "EditorEventBatch" ADD CONSTRAINT "EditorEventBatch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
