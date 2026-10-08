import type { Asset as ApiAsset } from "@/lib/api/assets";

import { adaptApiAssetToUi } from "../asset-adapter";

const base: ApiAsset = {
  id: "a1",
  assetTagNumber: "VENT-7",
  equipmentName: "Ventilator",
  manufacturer: "Dräger",
  modelNumber: "V500",
  serialNumber: "SN1",
  deviceCategory: "LIFE_SUPPORT",
  assetStatus: "ACTIVE",
  criticalityLevel: "CRITICAL",
  riskClassification: "CLASS_III",
  purchaseDate: "2024-01-15T00:00:00.000Z",
  purchaseCost: 0,
  usefulLifeYears: 10,
  organizationId: "org",
  currentFacilityId: "f1",
  primaryCustodianId: "u1",
  custodianDepartmentId: "d1",
  createdAt: "2024-01-15T00:00:00.000Z",
  updatedAt: "2024-01-15T00:00:00.000Z",
};

describe("adaptApiAssetToUi", () => {
  it.each([
    ["ACTIVE", "operational"],
    ["IN_SERVICE", "operational"],
    ["IN_MAINTENANCE", "maintenance"],
    ["QUARANTINED", "critical"],
    ["CONDEMNED", "critical"],
    ["RETIRED", "decommissioned"],
    ["DISPOSED", "decommissioned"],
  ])("shows %s as %s", (assetStatus, expected) => {
    expect(adaptApiAssetToUi({ ...base, assetStatus }).status).toBe(expected);
  });

  it("maps database categories", () => {
    expect(adaptApiAssetToUi(base).category).toBe("therapeutic");
    expect(adaptApiAssetToUi({ ...base, deviceCategory: "PATIENT_MONITORING" }).category).toBe("monitoring");
    expect(adaptApiAssetToUi({ ...base, deviceCategory: "IMAGING" }).category).toBe("diagnostic");
  });

  it("uses the real PM dates and does not invent health or utilization", () => {
    const ui = adaptApiAssetToUi({
      ...base,
      lastPmDate: "2026-09-01T00:00:00.000Z",
      nextPmDueDate: "2026-12-01T00:00:00.000Z",
    });
    expect(ui.lastMaintenance).toBe("2026-09-01T00:00:00.000Z");
    expect(ui.nextMaintenance).toBe("2026-12-01T00:00:00.000Z");
    expect(ui.healthScore).toBeNull();
    expect(ui.utilizationRate).toBeNull();
  });
});
