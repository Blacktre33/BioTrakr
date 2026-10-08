-- Assets are soft-deleted (deletedAt). Deleting an asset row must never
-- cascade away its maintenance, compliance, location, usage or scan history,
-- so these foreign keys now RESTRICT instead of CASCADE.

-- DropForeignKey
ALTER TABLE "location_history" DROP CONSTRAINT "location_history_assetId_fkey";

-- DropForeignKey
ALTER TABLE "usage_logs" DROP CONSTRAINT "usage_logs_assetId_fkey";

-- DropForeignKey
ALTER TABLE "iot_sensor_readings" DROP CONSTRAINT "iot_sensor_readings_assetId_fkey";

-- DropForeignKey
ALTER TABLE "predictive_scores_history" DROP CONSTRAINT "predictive_scores_history_assetId_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_history" DROP CONSTRAINT "maintenance_history_assetId_fkey";

-- DropForeignKey
ALTER TABLE "compliance_events" DROP CONSTRAINT "compliance_events_assetId_fkey";

-- DropForeignKey
ALTER TABLE "alert_history" DROP CONSTRAINT "alert_history_assetId_fkey";

-- DropForeignKey
ALTER TABLE "assignment_history" DROP CONSTRAINT "assignment_history_assetId_fkey";

-- DropForeignKey
ALTER TABLE "transfer_history" DROP CONSTRAINT "transfer_history_assetId_fkey";

-- DropForeignKey
ALTER TABLE "training_records" DROP CONSTRAINT "training_records_assetId_fkey";

-- DropForeignKey
ALTER TABLE "media_attachments" DROP CONSTRAINT "media_attachments_assetId_fkey";

-- DropForeignKey
ALTER TABLE "asset_scan_logs" DROP CONSTRAINT "asset_scan_logs_assetId_fkey";

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_sensor_readings" ADD CONSTRAINT "iot_sensor_readings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictive_scores_history" ADD CONSTRAINT "predictive_scores_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_history" ADD CONSTRAINT "maintenance_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_scan_logs" ADD CONSTRAINT "asset_scan_logs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

