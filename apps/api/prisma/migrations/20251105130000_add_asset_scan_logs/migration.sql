-- CreateTable
CREATE TABLE "asset_scan_logs" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "qr_payload" TEXT NOT NULL,
    "notes" TEXT,
    "location_hint" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_scan_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "asset_scan_logs"
  ADD CONSTRAINT "asset_scan_logs_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "asset_scan_logs_asset_id_created_at_idx"
  ON "asset_scan_logs"("asset_id", "created_at");

