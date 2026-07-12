-- CreateIndex
CREATE UNIQUE INDEX "ReviewNote_sessionId_reviewerId_key" ON "ReviewNote"("sessionId", "reviewerId");
