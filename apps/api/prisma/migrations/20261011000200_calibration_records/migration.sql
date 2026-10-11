-- Calibration records: what was calibrated, by whom, against which
-- certificate, and the result. Records are never edited or deleted (NABH:
-- records cannot be altered); a correction is a new record that names the
-- one it replaces.

-- CreateEnum
CREATE TYPE "CalibrationResult" AS ENUM ('PASS', 'ADJUSTED', 'FAIL');

-- CreateEnum
CREATE TYPE "ServiceProvider" AS ENUM ('IN_HOUSE', 'EXTERNAL_LAB', 'VENDOR');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "lastCalibrationResult" "CalibrationResult";

-- The schedule now opens calibration work orders as well as PM ones, so its
-- due date is no longer PM-only, and one device can have a PM and a
-- calibration due on the same day. Renamed in place: existing PM work
-- orders keep their due dates.
DROP INDEX "maintenance_history_assetId_pmDueDate_key";
ALTER TABLE "maintenance_history" RENAME COLUMN "pmDueDate" TO "dueDate";
CREATE UNIQUE INDEX "maintenance_history_assetId_workOrderType_dueDate_key" ON "maintenance_history"("assetId", "workOrderType", "dueDate");

-- CreateTable
CREATE TABLE "calibration_records" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "calibratedAt" TIMESTAMP(3) NOT NULL,
    "provider" "ServiceProvider" NOT NULL,
    "providerName" VARCHAR(200),
    "labAccreditationNumber" VARCHAR(100),
    "certificateNumber" VARCHAR(100),
    "validUntil" TIMESTAMP(3),
    "measurementUncertainty" VARCHAR(500),
    "referenceStandards" VARCHAR(1000),
    "result" "CalibrationResult" NOT NULL,
    "notes" VARCHAR(2000),
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesId" TEXT,
    "correctionReason" VARCHAR(1000),

    CONSTRAINT "calibration_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calibration_records_supersedesId_key" ON "calibration_records"("supersedesId");

-- CreateIndex
CREATE INDEX "calibration_records_assetId_calibratedAt_idx" ON "calibration_records"("assetId", "calibratedAt" DESC);

-- CreateIndex
CREATE INDEX "calibration_records_workOrderId_idx" ON "calibration_records"("workOrderId");

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_history"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "calibration_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Records are written once. The database refuses any change or removal,
-- whichever client sends it; getting around this means deliberately
-- disabling the trigger, a schema change.
CREATE FUNCTION "forbid_record_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% records cannot be changed or deleted; record a correction instead', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "calibration_records_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "calibration_records"
  FOR EACH ROW EXECUTE FUNCTION "forbid_record_change"();

CREATE TRIGGER "calibration_records_no_truncate"
  BEFORE TRUNCATE ON "calibration_records"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_record_change"();
