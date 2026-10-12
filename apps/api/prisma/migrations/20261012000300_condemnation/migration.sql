-- Condemnation: a proposal to condemn a device, the committee's decision
-- and the disposal, with their papers attached.

-- CreateEnum
CREATE TYPE "CondemnationStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'DISPOSED');

-- CreateEnum
CREATE TYPE "DisposalMethod" AS ENUM ('E_WASTE_RECYCLER', 'BUYBACK', 'AUCTION', 'TRANSFER', 'OTHER');

-- AlterEnum
ALTER TYPE "DocumentCategory" ADD VALUE 'CONDEMNATION';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "condemnationId" TEXT;

-- CreateTable
CREATE TABLE "condemnations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" "CondemnationStatus" NOT NULL DEFAULT 'PROPOSED',
    "reasons" TEXT[],
    "justification" TEXT NOT NULL,
    "repairEstimate" DECIMAL(12,2),
    "currentValue" DECIMAL(12,2),
    "evidence" JSONB NOT NULL,
    "proposedById" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "committee" VARCHAR(500),
    "decisionNote" TEXT,
    "withdrawnById" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawalReason" TEXT,
    "disposedById" TEXT,
    "disposedAt" TIMESTAMP(3),
    "disposalMethod" "DisposalMethod",
    "disposalNote" TEXT,
    "clearance" VARCHAR(500),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condemnations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "condemnations_organizationId_status_idx" ON "condemnations"("organizationId", "status");

-- CreateIndex
CREATE INDEX "condemnations_assetId_idx" ON "condemnations"("assetId");

-- CreateIndex
CREATE INDEX "documents_condemnationId_idx" ON "documents"("condemnationId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_condemnationId_fkey" FOREIGN KEY ("condemnationId") REFERENCES "condemnations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condemnations" ADD CONSTRAINT "condemnations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condemnations" ADD CONSTRAINT "condemnations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condemnations" ADD CONSTRAINT "condemnations_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condemnations" ADD CONSTRAINT "condemnations_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condemnations" ADD CONSTRAINT "condemnations_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condemnations" ADD CONSTRAINT "condemnations_disposedById_fkey" FOREIGN KEY ("disposedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A document belongs to at most one record (now including a condemnation),
-- and to a device or a contract.
ALTER TABLE "documents" DROP CONSTRAINT "documents_target_check";
ALTER TABLE "documents" ADD CONSTRAINT "documents_target_check" CHECK (
  num_nonnulls("calibrationRecordId", "safetyTestRecordId", "contractId", "workOrderId", "condemnationId") <= 1
  AND ("assetId" IS NOT NULL OR "contractId" IS NOT NULL)
);

-- The condemnation file is kept: a proposal is withdrawn or rejected, never
-- deleted (forbid_record_change() is from 20261011000200).
CREATE TRIGGER "condemnations_no_delete"
  BEFORE DELETE ON "condemnations"
  FOR EACH ROW EXECUTE FUNCTION "forbid_record_change"();

CREATE TRIGGER "condemnations_no_truncate"
  BEFORE TRUNCATE ON "condemnations"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_record_change"();
