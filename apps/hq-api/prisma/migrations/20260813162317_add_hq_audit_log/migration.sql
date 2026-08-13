-- CreateTable
CREATE TABLE "HqAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HqAuditLog_createdAt_idx" ON "HqAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "HqAuditLog" ADD CONSTRAINT "HqAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "hq_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
