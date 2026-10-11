-- Electrical safety tests (IS/IEC 62353): the device's protection class and
-- applied parts, a test interval, and immutable test records. Pass or fail
-- is computed by the API from the standard's limits and stored with the
-- limits each reading was held to. A correction is a new record that names
-- the one it replaces.

-- CreateEnum
CREATE TYPE "ElectricalClass" AS ENUM ('CLASS_I', 'CLASS_II', 'INTERNALLY_POWERED');

-- CreateEnum
CREATE TYPE "AppliedPartType" AS ENUM ('NONE', 'B', 'BF', 'CF');

-- CreateEnum
CREATE TYPE "LeakageMethod" AS ENUM ('DIRECT', 'DIFFERENTIAL', 'ALTERNATIVE');

-- CreateEnum
CREATE TYPE "SafetyTestReason" AS ENUM ('ROUTINE', 'AFTER_REPAIR', 'ACCEPTANCE');

-- AlterEnum
ALTER TYPE "WorkOrderType" ADD VALUE 'ELECTRICAL_SAFETY_TEST';

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "appliedPartType" "AppliedPartType",
ADD COLUMN     "electricalClass" "ElectricalClass",
ADD COLUMN     "lastSafetyTestPassed" BOOLEAN,
ADD COLUMN     "requiresSafetyTest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "safetyTestFrequencyDays" INTEGER;

-- CreateTable
CREATE TABLE "safety_test_records" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "testedAt" TIMESTAMP(3) NOT NULL,
    "reason" "SafetyTestReason" NOT NULL,
    "provider" "ServiceProvider" NOT NULL,
    "providerName" VARCHAR(200),
    "analyzer" VARCHAR(300) NOT NULL,
    "electricalClass" "ElectricalClass" NOT NULL,
    "appliedPartType" "AppliedPartType" NOT NULL,
    "leakageMethod" "LeakageMethod" NOT NULL,
    "medicalSystem" BOOLEAN NOT NULL DEFAULT false,
    "mobileXray" BOOLEAN NOT NULL DEFAULT false,
    "defibrillationPaddles" BOOLEAN NOT NULL DEFAULT false,
    "visualInspectionPassed" BOOLEAN NOT NULL,
    "functionalTestPassed" BOOLEAN NOT NULL,
    "earthResistanceOhm" DOUBLE PRECISION,
    "insulationMainsMOhm" DOUBLE PRECISION,
    "insulationAppliedMOhm" DOUBLE PRECISION,
    "equipmentLeakageUa" DOUBLE PRECISION,
    "appliedPartLeakageUa" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL,
    "checks" JSONB NOT NULL,
    "notes" VARCHAR(2000),
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesId" TEXT,
    "correctionReason" VARCHAR(1000),
    CONSTRAINT "safety_test_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "safety_test_records_supersedesId_key" ON "safety_test_records"("supersedesId");

-- CreateIndex
CREATE INDEX "safety_test_records_assetId_testedAt_idx" ON "safety_test_records"("assetId", "testedAt" DESC);

-- CreateIndex
CREATE INDEX "safety_test_records_workOrderId_idx" ON "safety_test_records"("workOrderId");

-- AddForeignKey
ALTER TABLE "safety_test_records" ADD CONSTRAINT "safety_test_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_test_records" ADD CONSTRAINT "safety_test_records_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_history"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_test_records" ADD CONSTRAINT "safety_test_records_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_test_records" ADD CONSTRAINT "safety_test_records_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "safety_test_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Records are written once (same rule as calibration_records).
CREATE TRIGGER "safety_test_records_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "safety_test_records"
  FOR EACH ROW EXECUTE FUNCTION "forbid_record_change"();

CREATE TRIGGER "safety_test_records_no_truncate"
  BEFORE TRUNCATE ON "safety_test_records"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_record_change"();
