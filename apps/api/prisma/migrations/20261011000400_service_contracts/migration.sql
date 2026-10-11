-- AMC/CMC service contracts and per-hospital vendors.
--
-- Vendors were one global list with a required, globally unique code, and
-- nothing used them. Each hospital now keeps its own list: rows from before
-- this have no organization and are not shown. A contract covers one or
-- more devices for a period; a renewal is a new contract naming the one it
-- renews, so each year's cost is kept.

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('AMC', 'CMC');

-- DropIndex
DROP INDEX "vendors_vendorCode_key";

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "organizationId" TEXT,
ALTER COLUMN "vendorCode" DROP NOT NULL;

-- CreateTable
CREATE TABLE "service_contracts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "contractNumber" VARCHAR(100) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "annualValue" DECIMAL(12,2),
    "pmVisitsPerYear" INTEGER,
    "responseTimeHours" INTEGER,
    "uptimeGuaranteePercent" DECIMAL(5,2),
    "notes" VARCHAR(2000),
    "renewsId" TEXT,
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" VARCHAR(1000),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_contract_assets" (
    "contractId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "service_contract_assets_pkey" PRIMARY KEY ("contractId","assetId")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_contracts_renewsId_key" ON "service_contracts"("renewsId");

-- CreateIndex
CREATE INDEX "service_contracts_organizationId_endDate_idx" ON "service_contracts"("organizationId", "endDate");

-- CreateIndex
CREATE INDEX "service_contracts_vendorId_idx" ON "service_contracts"("vendorId");

-- CreateIndex
CREATE INDEX "service_contract_assets_assetId_idx" ON "service_contract_assets"("assetId");

-- CreateIndex
CREATE INDEX "assets_warrantyEndDate_idx" ON "assets"("warrantyEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_organizationId_vendorCode_key" ON "vendors"("organizationId", "vendorCode");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_organizationId_vendorName_key" ON "vendors"("organizationId", "vendorName");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_renewsId_fkey" FOREIGN KEY ("renewsId") REFERENCES "service_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contract_assets" ADD CONSTRAINT "service_contract_assets_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contract_assets" ADD CONSTRAINT "service_contract_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A contract cannot end before it starts.
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_period_check" CHECK ("endDate" >= "startDate");
