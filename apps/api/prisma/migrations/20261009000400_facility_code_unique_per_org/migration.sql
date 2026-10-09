-- Facility codes are unique within an organization, like asset tags.


-- DropIndex
DROP INDEX "facilities_facilityCode_key";

-- CreateIndex
CREATE UNIQUE INDEX "facilities_organizationId_facilityCode_key" ON "facilities"("organizationId", "facilityCode");

