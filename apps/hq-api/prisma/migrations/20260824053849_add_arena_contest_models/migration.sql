-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('draft', 'scheduled', 'live', 'grading', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ArenaDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "ArenaProctoringLevel" AS ENUM ('none', 'basic', 'strict', 'lockdown');

-- CreateEnum
CREATE TYPE "ContestScoringMode" AS ENUM ('points', 'icpc_penalty');

-- CreateEnum
CREATE TYPE "ContestSyncStatus" AS ENUM ('idle', 'pending', 'synced', 'failed');

-- CreateTable
CREATE TABLE "contest" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ContestStatus" NOT NULL DEFAULT 'draft',
    "scoringMode" "ContestScoringMode" NOT NULL DEFAULT 'points',
    "proctoringLevel" "ArenaProctoringLevel" NOT NULL DEFAULT 'basic',
    "webcamRequired" BOOLEAN NOT NULL DEFAULT false,
    "fullscreenRequired" BOOLEAN NOT NULL DEFAULT true,
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdByStaffId" TEXT NOT NULL,
    "syncStatus" "ContestSyncStatus" NOT NULL DEFAULT 'idle',
    "syncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "resultsSnapshot" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_question" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "difficulty" "ArenaDifficulty" NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "typeConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_question_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contest_slug_key" ON "contest"("slug");

-- CreateIndex
CREATE INDEX "contest_status_startAt_idx" ON "contest"("status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "contest_question_contestId_seq_key" ON "contest_question"("contestId", "seq");

-- AddForeignKey
ALTER TABLE "contest" ADD CONSTRAINT "contest_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "hq_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_question" ADD CONSTRAINT "contest_question_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
