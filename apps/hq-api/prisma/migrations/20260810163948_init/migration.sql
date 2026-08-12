-- CreateEnum
CREATE TYPE "HqRole" AS ENUM ('owner', 'staff');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('lead', 'trial', 'live', 'churned');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('note', 'status_change', 'system');

-- CreateEnum
CREATE TYPE "LeadIntent" AS ENUM ('demo', 'sales');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'converted', 'dismissed');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "hq_staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "HqRole" NOT NULL DEFAULT 'staff',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hq_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hq_refresh_token" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hq_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'lead',
    "appDomain" TEXT,
    "mediaDomain" TEXT,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_activity" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorId" TEXT,
    "type" "ActivityType" NOT NULL DEFAULT 'note',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "teamSize" TEXT,
    "focus" TEXT,
    "message" TEXT,
    "intent" "LeadIntent" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_target" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "sshPort" INTEGER NOT NULL DEFAULT 22,
    "sshUsername" TEXT NOT NULL,
    "sshPrivateKeyEnc" TEXT NOT NULL,
    "sshKeyFingerprint" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL DEFAULT 'https://github.com/itzsam-lol/codeforge.git',
    "appDomain" TEXT NOT NULL,
    "mediaDomain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provisioning_target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_run" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provisioning_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_step" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "output" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "provisioning_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hq_staff_email_key" ON "hq_staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "hq_refresh_token_tokenHash_key" ON "hq_refresh_token"("tokenHash");

-- CreateIndex
CREATE INDEX "hq_refresh_token_staffId_idx" ON "hq_refresh_token"("staffId");

-- CreateIndex
CREATE INDEX "client_activity_clientId_idx" ON "client_activity"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "provisioning_target_clientId_key" ON "provisioning_target"("clientId");

-- CreateIndex
CREATE INDEX "provisioning_run_targetId_idx" ON "provisioning_run"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "provisioning_step_runId_seq_key" ON "provisioning_step"("runId", "seq");

-- AddForeignKey
ALTER TABLE "hq_refresh_token" ADD CONSTRAINT "hq_refresh_token_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "hq_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activity" ADD CONSTRAINT "client_activity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activity" ADD CONSTRAINT "client_activity_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "hq_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_target" ADD CONSTRAINT "provisioning_target_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_run" ADD CONSTRAINT "provisioning_run_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "provisioning_target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_step" ADD CONSTRAINT "provisioning_step_runId_fkey" FOREIGN KEY ("runId") REFERENCES "provisioning_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
