-- Record who scanned a device. Existing scans keep a null scanner.

-- AlterTable
ALTER TABLE "asset_scan_logs" ADD COLUMN     "scannedById" TEXT;

-- CreateIndex
CREATE INDEX "asset_scan_logs_scannedById_createdAt_idx" ON "asset_scan_logs"("scannedById", "createdAt");

-- AddForeignKey
ALTER TABLE "asset_scan_logs" ADD CONSTRAINT "asset_scan_logs_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
