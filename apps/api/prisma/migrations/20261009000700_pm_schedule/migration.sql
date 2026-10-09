-- PM schedule: work orders the schedule opens have no person behind them,
-- and each asset gets at most one per PM due date.

-- AlterTable
ALTER TABLE "maintenance_history" ADD COLUMN     "pmDueDate" TIMESTAMP(3),
ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_history_assetId_pmDueDate_key" ON "maintenance_history"("assetId", "pmDueDate");
