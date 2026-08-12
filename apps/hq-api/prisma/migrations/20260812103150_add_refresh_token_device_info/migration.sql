-- AlterTable
ALTER TABLE "hq_refresh_token" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "userAgent" TEXT;
