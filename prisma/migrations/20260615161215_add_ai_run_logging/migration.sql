-- AlterTable
ALTER TABLE "ai_runs" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "costEstimateUsd" DECIMAL(10,6),
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "resultJson" JSONB,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "ai_runs_status_idx" ON "ai_runs"("status");
