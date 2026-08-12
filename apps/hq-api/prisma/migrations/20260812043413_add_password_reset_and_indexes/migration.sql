-- CreateTable
CREATE TABLE "hq_password_reset_token" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hq_password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hq_password_reset_token_tokenHash_key" ON "hq_password_reset_token"("tokenHash");

-- CreateIndex
CREATE INDEX "hq_password_reset_token_staffId_idx" ON "hq_password_reset_token"("staffId");

-- CreateIndex
CREATE INDEX "client_status_idx" ON "client"("status");

-- CreateIndex
CREATE INDEX "client_nextRenewalDate_idx" ON "client"("nextRenewalDate");

-- CreateIndex
CREATE INDEX "client_updatedAt_idx" ON "client"("updatedAt");

-- CreateIndex
CREATE INDEX "lead_status_idx" ON "lead"("status");

-- AddForeignKey
ALTER TABLE "hq_password_reset_token" ADD CONSTRAINT "hq_password_reset_token_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "hq_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
