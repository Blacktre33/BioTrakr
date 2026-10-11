-- Evidence files (calibration certificates, safety analyser reports, signed
-- service reports, contracts), held in the database so the nightly pg_dump
-- backs them up and a restore brings records and files back together.
-- Documents and withdrawals are written once, like calibration records.

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CALIBRATION_CERTIFICATE', 'SAFETY_TEST_REPORT', 'SERVICE_REPORT', 'CONTRACT', 'INSTALLATION_REPORT', 'MANUAL', 'INVOICE', 'OTHER');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT,
    "calibrationRecordId" TEXT,
    "safetyTestRecordId" TEXT,
    "contractId" TEXT,
    "workOrderId" TEXT,
    "category" "DocumentCategory" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "content" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_withdrawals" (
    "documentId" TEXT NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "withdrawnById" TEXT NOT NULL,
    "withdrawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_withdrawals_pkey" PRIMARY KEY ("documentId")
);

-- CreateIndex
CREATE INDEX "documents_organizationId_uploadedAt_idx" ON "documents"("organizationId", "uploadedAt");

-- CreateIndex
CREATE INDEX "documents_assetId_idx" ON "documents"("assetId");

-- CreateIndex
CREATE INDEX "documents_calibrationRecordId_idx" ON "documents"("calibrationRecordId");

-- CreateIndex
CREATE INDEX "documents_safetyTestRecordId_idx" ON "documents"("safetyTestRecordId");

-- CreateIndex
CREATE INDEX "documents_contractId_idx" ON "documents"("contractId");

-- CreateIndex
CREATE INDEX "documents_workOrderId_idx" ON "documents"("workOrderId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_calibrationRecordId_fkey" FOREIGN KEY ("calibrationRecordId") REFERENCES "calibration_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_safetyTestRecordId_fkey" FOREIGN KEY ("safetyTestRecordId") REFERENCES "safety_test_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_history"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_withdrawals" ADD CONSTRAINT "document_withdrawals_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_withdrawals" ADD CONSTRAINT "document_withdrawals_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A document belongs to at most one record, and to a device or a contract.
ALTER TABLE "documents" ADD CONSTRAINT "documents_target_check" CHECK (
  num_nonnulls("calibrationRecordId", "safetyTestRecordId", "contractId", "workOrderId") <= 1
  AND ("assetId" IS NOT NULL OR "contractId" IS NOT NULL)
);

-- Written once (forbid_record_change() is from 20261011000200).
CREATE TRIGGER "documents_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "documents"
  FOR EACH ROW EXECUTE FUNCTION "forbid_record_change"();

CREATE TRIGGER "documents_no_truncate"
  BEFORE TRUNCATE ON "documents"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_record_change"();

CREATE TRIGGER "document_withdrawals_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "document_withdrawals"
  FOR EACH ROW EXECUTE FUNCTION "forbid_record_change"();

CREATE TRIGGER "document_withdrawals_no_truncate"
  BEFORE TRUNCATE ON "document_withdrawals"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_record_change"();
