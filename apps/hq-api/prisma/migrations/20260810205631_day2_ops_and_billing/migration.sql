-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'overdue');

-- AlterTable
ALTER TABLE "client" ADD COLUMN     "mrrCents" INTEGER,
ADD COLUMN     "nextRenewalDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_check_log" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "healthy" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "detail" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_check_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_clientId_idx" ON "invoice"("clientId");

-- CreateIndex
CREATE INDEX "health_check_log_targetId_checkedAt_idx" ON "health_check_log"("targetId", "checkedAt");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_check_log" ADD CONSTRAINT "health_check_log_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "provisioning_target"("id") ON DELETE CASCADE ON UPDATE CASCADE;
