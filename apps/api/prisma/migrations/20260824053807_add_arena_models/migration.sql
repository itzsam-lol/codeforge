-- CreateEnum
CREATE TYPE "ArenaOAuthProvider" AS ENUM ('google', 'github');

-- CreateEnum
CREATE TYPE "ArenaParticipationStatus" AS ENUM ('registered', 'active', 'submitted', 'disqualified');

-- CreateEnum
CREATE TYPE "ArenaSubmissionMode" AS ENUM ('contest', 'practice');

-- CreateEnum
CREATE TYPE "ArenaDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateTable
CREATE TABLE "ArenaUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT NOT NULL DEFAULT '',
    "country" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "ratingUpdatedAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArenaUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaOAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ArenaOAuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaOAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaContestCache" (
    "contestId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaContestCache_pkey" PRIMARY KEY ("contestId")
);

-- CreateTable
CREATE TABLE "ArenaParticipation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "status" "ArenaParticipationStatus" NOT NULL DEFAULT 'registered',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penaltyMs" BIGINT NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ratingBefore" INTEGER,
    "ratingAfter" INTEGER,

    CONSTRAINT "ArenaParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaPracticeProblem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "difficulty" "ArenaDifficulty" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "typeConfig" JSONB NOT NULL DEFAULT '{}',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArenaPracticeProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "ArenaSubmissionMode" NOT NULL,
    "contestId" TEXT,
    "participationId" TEXT,
    "contestQuestionId" TEXT,
    "practiceProblemId" TEXT,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "judge0Meta" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaBadge" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaUserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contextLabel" TEXT,

    CONSTRAINT "ArenaUserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArenaUser_email_key" ON "ArenaUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaUser_handle_key" ON "ArenaUser"("handle");

-- CreateIndex
CREATE INDEX "ArenaUser_rating_idx" ON "ArenaUser"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaRefreshToken_tokenHash_key" ON "ArenaRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ArenaRefreshToken_userId_idx" ON "ArenaRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "ArenaOAuthAccount_userId_idx" ON "ArenaOAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaOAuthAccount_provider_providerUserId_key" ON "ArenaOAuthAccount"("provider", "providerUserId");

-- CreateIndex
CREATE INDEX "ArenaParticipation_contestId_score_idx" ON "ArenaParticipation"("contestId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaParticipation_userId_contestId_key" ON "ArenaParticipation"("userId", "contestId");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaPracticeProblem_slug_key" ON "ArenaPracticeProblem"("slug");

-- CreateIndex
CREATE INDEX "ArenaSubmission_userId_mode_idx" ON "ArenaSubmission"("userId", "mode");

-- CreateIndex
CREATE INDEX "ArenaSubmission_contestId_contestQuestionId_idx" ON "ArenaSubmission"("contestId", "contestQuestionId");

-- CreateIndex
CREATE INDEX "ArenaSubmission_practiceProblemId_idx" ON "ArenaSubmission"("practiceProblemId");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaBadge_key_key" ON "ArenaBadge"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaUserBadge_userId_badgeId_key" ON "ArenaUserBadge"("userId", "badgeId");

-- CreateIndex
CREATE INDEX "ArenaActivity_userId_createdAt_idx" ON "ArenaActivity"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ArenaRefreshToken" ADD CONSTRAINT "ArenaRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ArenaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaOAuthAccount" ADD CONSTRAINT "ArenaOAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ArenaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaParticipation" ADD CONSTRAINT "ArenaParticipation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ArenaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaSubmission" ADD CONSTRAINT "ArenaSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ArenaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaSubmission" ADD CONSTRAINT "ArenaSubmission_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "ArenaParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaSubmission" ADD CONSTRAINT "ArenaSubmission_practiceProblemId_fkey" FOREIGN KEY ("practiceProblemId") REFERENCES "ArenaPracticeProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaUserBadge" ADD CONSTRAINT "ArenaUserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ArenaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaUserBadge" ADD CONSTRAINT "ArenaUserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "ArenaBadge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaActivity" ADD CONSTRAINT "ArenaActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ArenaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
