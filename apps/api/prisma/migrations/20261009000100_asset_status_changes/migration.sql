-- Who changed an asset's status, when, why, and from where. Append-only.


-- CreateEnum
CREATE TYPE "StatusChangeSource" AS ENUM ('MANUAL', 'FAULT_REPORT', 'WORK_ORDER', 'DEVICE_ALERT', 'IMPORT');

-- CreateTable
CREATE TABLE "asset_status_changes" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromStatus" "AssetStatus" NOT NULL,
    "toStatus" "AssetStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "StatusChangeSource" NOT NULL DEFAULT 'MANUAL',
    "changedById" TEXT,
    "workOrderId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_status_changes_assetId_changedAt_idx" ON "asset_status_changes"("assetId", "changedAt" DESC);

-- AddForeignKey
ALTER TABLE "asset_status_changes" ADD CONSTRAINT "asset_status_changes_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_status_changes" ADD CONSTRAINT "asset_status_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

