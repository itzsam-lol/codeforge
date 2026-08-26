-- AlterTable
ALTER TABLE "ArenaContestCache" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ArenaParticipation" ADD COLUMN     "isVirtual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "virtualStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ArenaForumThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaForumThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaForumReply" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaForumReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaFollow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArenaForumThread_contestId_pinned_createdAt_idx" ON "ArenaForumThread"("contestId", "pinned", "createdAt");

-- CreateIndex
CREATE INDEX "ArenaForumReply_threadId_createdAt_idx" ON "ArenaForumReply"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ArenaFollow_followingId_idx" ON "ArenaFollow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaFollow_followerId_followingId_key" ON "ArenaFollow"("followerId", "followingId");

-- AddForeignKey
ALTER TABLE "ArenaForumThread" ADD CONSTRAINT "ArenaForumThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ArenaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaForumReply" ADD CONSTRAINT "ArenaForumReply_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ArenaForumThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaForumReply" ADD CONSTRAINT "ArenaForumReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ArenaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaFollow" ADD CONSTRAINT "ArenaFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "ArenaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaFollow" ADD CONSTRAINT "ArenaFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "ArenaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
