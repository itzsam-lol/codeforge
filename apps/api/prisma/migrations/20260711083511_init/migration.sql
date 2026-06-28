-- CreateEnum
CREATE TYPE "Role" AS ENUM ('super_admin', 'recruiter', 'reviewer');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('dsa', 'mcq', 'frontend_ui', 'bug_fix', 'api_challenge', 'repo_project');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('draft', 'published', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'opened', 'started', 'completed', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('created', 'in_progress', 'submitted', 'auto_submitted', 'expired');

-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('run', 'submit');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('queued', 'running', 'graded', 'failed');

-- CreateEnum
CREATE TYPE "ProctoringLevel" AS ENUM ('none', 'basic', 'strict', 'lockdown');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandingConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "typeConfig" JSONB NOT NULL DEFAULT '{}',
    "difficulty" "Difficulty" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedMinutes" INTEGER,
    "rubric" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rootId" TEXT,
    "supersededById" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expectedOutput" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Test" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "proctoringLevel" "ProctoringLevel" NOT NULL DEFAULT 'none',
    "schedulingStart" TIMESTAMP(3),
    "schedulingEnd" TIMESTAMP(3),
    "status" "TestStatus" NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestQuestion" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "questionId" TEXT,
    "poolId" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 10,

    CONSTRAINT "TestQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPool" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "questionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "QuestionPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestSession" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'created',
    "currentQuestionId" TEXT,
    "questionOrder" JSONB,
    "integrityScore" INTEGER,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerDraft" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "kind" "SubmissionKind" NOT NULL DEFAULT 'submit',
    "content" TEXT NOT NULL,
    "language" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'queued',
    "autoScore" DOUBLE PRECISION,
    "manualScore" DOUBLE PRECISION,
    "maxPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeResult" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "testCaseId" TEXT,
    "judge0Token" TEXT,
    "verdict" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "stdout" TEXT,
    "stderr" TEXT,
    "compileOutput" TEXT,
    "timeMs" INTEGER,
    "memoryKb" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProctoringEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProctoringEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlagiarismReport" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "comparedSubmissionId" TEXT NOT NULL,
    "similarityPct" DOUBLE PRECISION NOT NULL,
    "matchedRanges" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlagiarismReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewNote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "rubricScores" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Question_orgId_type_isArchived_idx" ON "Question"("orgId", "type", "isArchived");

-- CreateIndex
CREATE INDEX "Question_orgId_supersededById_idx" ON "Question"("orgId", "supersededById");

-- CreateIndex
CREATE INDEX "TestCase_questionId_idx" ON "TestCase"("questionId");

-- CreateIndex
CREATE INDEX "Test_orgId_status_idx" ON "Test"("orgId", "status");

-- CreateIndex
CREATE INDEX "TestQuestion_testId_orderIndex_idx" ON "TestQuestion"("testId", "orderIndex");

-- CreateIndex
CREATE INDEX "QuestionPool_testId_idx" ON "QuestionPool"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_testId_status_idx" ON "Invitation"("testId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_testId_candidateEmail_key" ON "Invitation"("testId", "candidateEmail");

-- CreateIndex
CREATE UNIQUE INDEX "TestSession_invitationId_key" ON "TestSession"("invitationId");

-- CreateIndex
CREATE INDEX "TestSession_testId_status_idx" ON "TestSession"("testId", "status");

-- CreateIndex
CREATE INDEX "TestSession_status_endsAt_idx" ON "TestSession"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerDraft_sessionId_questionId_key" ON "AnswerDraft"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "Submission_sessionId_questionId_idx" ON "Submission"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "Submission_questionId_kind_idx" ON "Submission"("questionId", "kind");

-- CreateIndex
CREATE INDEX "JudgeResult_submissionId_idx" ON "JudgeResult"("submissionId");

-- CreateIndex
CREATE INDEX "ProctoringEvent_sessionId_createdAt_idx" ON "ProctoringEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "PlagiarismReport_submissionId_idx" ON "PlagiarismReport"("submissionId");

-- CreateIndex
CREATE INDEX "ReviewNote_sessionId_idx" ON "ReviewNote"("sessionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestQuestion" ADD CONSTRAINT "TestQuestion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestQuestion" ADD CONSTRAINT "TestQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestQuestion" ADD CONSTRAINT "TestQuestion_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "QuestionPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPool" ADD CONSTRAINT "QuestionPool_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSession" ADD CONSTRAINT "TestSession_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSession" ADD CONSTRAINT "TestSession_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerDraft" ADD CONSTRAINT "AnswerDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeResult" ADD CONSTRAINT "JudgeResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeResult" ADD CONSTRAINT "JudgeResult_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctoringEvent" ADD CONSTRAINT "ProctoringEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlagiarismReport" ADD CONSTRAINT "PlagiarismReport_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlagiarismReport" ADD CONSTRAINT "PlagiarismReport_comparedSubmissionId_fkey" FOREIGN KEY ("comparedSubmissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
