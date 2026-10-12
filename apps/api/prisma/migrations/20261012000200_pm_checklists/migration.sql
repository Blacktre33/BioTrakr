-- Preventive maintenance checklists: the hospital's own checklists, and
-- what each PM found item by item. Records are written once, like
-- calibration records.

-- CreateEnum
CREATE TYPE "PmOutcome" AS ENUM ('PASS', 'FLAG', 'FAIL');

-- CreateTable
CREATE TABLE "pm_checklist_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "keywords" TEXT[],
    "items" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pm_checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_checklist_records" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "checklistKey" VARCHAR(64) NOT NULL,
    "checklistName" VARCHAR(120) NOT NULL,
    "items" JSONB NOT NULL,
    "outcome" "PmOutcome" NOT NULL,
    "testEquipment" VARCHAR(500),
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pm_checklist_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pm_checklist_templates_organizationId_name_key" ON "pm_checklist_templates"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "pm_checklist_records_workOrderId_key" ON "pm_checklist_records"("workOrderId");

-- CreateIndex
CREATE INDEX "pm_checklist_records_assetId_recordedAt_idx" ON "pm_checklist_records"("assetId", "recordedAt" DESC);

-- AddForeignKey
ALTER TABLE "pm_checklist_templates" ADD CONSTRAINT "pm_checklist_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_checklist_records" ADD CONSTRAINT "pm_checklist_records_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_history"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_checklist_records" ADD CONSTRAINT "pm_checklist_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_checklist_records" ADD CONSTRAINT "pm_checklist_records_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TRIGGER "pm_checklist_records_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "pm_checklist_records"
  FOR EACH ROW EXECUTE FUNCTION "forbid_record_change"();

CREATE TRIGGER "pm_checklist_records_no_truncate"
  BEFORE TRUNCATE ON "pm_checklist_records"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_record_change"();
