-- CreateTable
CREATE TABLE "ArenaBroadcast" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArenaBroadcast_contestId_createdAt_idx" ON "ArenaBroadcast"("contestId", "createdAt");
