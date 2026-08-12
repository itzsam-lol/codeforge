-- AlterTable
ALTER TABLE "hq_staff" ADD COLUMN     "twoFactorBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "twoFactorEnabledAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorSecret" TEXT;

-- CreateTable
CREATE TABLE "hq_two_factor_challenge" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hq_two_factor_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hq_two_factor_challenge_tokenHash_key" ON "hq_two_factor_challenge"("tokenHash");

-- CreateIndex
CREATE INDEX "hq_two_factor_challenge_staffId_idx" ON "hq_two_factor_challenge"("staffId");

-- AddForeignKey
ALTER TABLE "hq_two_factor_challenge" ADD CONSTRAINT "hq_two_factor_challenge_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "hq_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
