-- CreateTable
CREATE TABLE "SessionNote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionNote_sessionId_createdAt_idx" ON "SessionNote"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
