-- AlterTable
ALTER TABLE "Invitation" ALTER COLUMN "token" DROP NOT NULL;
ALTER TABLE "Invitation" ADD COLUMN "tokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
