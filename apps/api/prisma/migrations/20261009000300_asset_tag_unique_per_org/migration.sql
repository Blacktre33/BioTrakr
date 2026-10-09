-- Asset tags are unique within an organization instead of across all of them.
-- Two hospitals can both have VENT-001; one hospital still cannot have it twice.


-- DropIndex
DROP INDEX "assets_assetTagNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "assets_organizationId_assetTagNumber_key" ON "assets"("organizationId", "assetTagNumber");

