-- DropIndex
DROP INDEX "tasks_userId_idx";

-- CreateIndex
CREATE INDEX "tasks_userId_createdAt_idx" ON "tasks"("userId", "createdAt");
