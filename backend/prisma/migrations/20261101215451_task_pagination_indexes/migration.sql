-- DropIndex
DROP INDEX "tasks_userId_status_idx";

-- CreateIndex
CREATE INDEX "tasks_userId_status_createdAt_idx" ON "tasks"("userId", "status", "createdAt");
