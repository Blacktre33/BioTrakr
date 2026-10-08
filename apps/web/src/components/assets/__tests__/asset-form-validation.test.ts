import {
  EMPTY_ASSET_FORM,
  contractIncrease,
  fieldErrorsFromApi,
  toCreateAssetPayload,
  validateAssetForm,
  type AssetFormValues,
} from "../asset-form-validation";

const TODAY = new Date(2026, 9, 8); // 8 Oct 2026, local time

const valid: AssetFormValues = {
  ...EMPTY_ASSET_FORM,
  assetTagNumber: " BME-001 ",
  equipmentName: "Ventilator",
  manufacturer: "Dräger",
  modelNumber: "V500",
  serialNumber: "SN1",
  deviceCategory: "LIFE_SUPPORT",
  criticalityLevel: "CRITICAL",
  riskClassification: "CLASS_III",
  currentFacilityId: "f1",
  custodianDepartmentId: "d1",
  primaryCustodianId: "u1",
  purchaseDate: "2024-01-15",
  purchaseCost: "0",
  usefulLifeYears: "10",
};

const reference = { departments: [{ id: "d1", name: "ICU", facilityId: "f1" }, { id: "d2", name: "OT", facilityId: "f2" }] };

describe("validateAssetForm", () => {
  it("accepts a complete form, including a purchase cost of 0", () => {
    expect(validateAssetForm(valid, reference, TODAY)).toEqual({});
  });

  it("marks every required field the API needs", () => {
    const errors = validateAssetForm({ ...EMPTY_ASSET_FORM, usefulLifeYears: "" }, null, TODAY);
    expect(Object.keys(errors).sort()).toEqual(
      [
        "assetTagNumber",
        "equipmentName",
        "manufacturer",
        "modelNumber",
        "serialNumber",
        "deviceCategory",
        "criticalityLevel",
        "riskClassification",
        "currentFacilityId",
        "custodianDepartmentId",
        "primaryCustodianId",
        "purchaseDate",
        "purchaseCost",
        "usefulLifeYears",
      ].sort(),
    );
    expect(errors.serialNumber).toBe("Required");
  });

  it("treats whitespace-only text as missing", () => {
    expect(validateAssetForm({ ...valid, equipmentName: "   " }, reference, TODAY).equipmentName).toBe("Required");
  });

  it("rejects a purchase date in the future but accepts today", () => {
    expect(validateAssetForm({ ...valid, purchaseDate: "2026-10-09" }, reference, TODAY).purchaseDate).toBe(
      "Can't be in the future",
    );
    expect(validateAssetForm({ ...valid, purchaseDate: "2026-10-08" }, reference, TODAY).purchaseDate).toBeUndefined();
  });

  it("checks amounts, useful life and years paid", () => {
    const errors = validateAssetForm(
      { ...valid, purchaseCost: "-1", usefulLifeYears: "2.5", amcYearsPaid: "-2", cmcCostAnnual: "abc" },
      reference,
      TODAY,
    );
    expect(errors.purchaseCost).toBe("Enter an amount of 0 or more");
    expect(errors.usefulLifeYears).toBe("Whole number of years, 1 to 50");
    expect(errors.amcYearsPaid).toBe("Whole number, 0 or more");
    expect(errors.cmcCostAnnual).toBe("Enter an amount of 0 or more");
  });

  it("requires contract end dates on or after the start date", () => {
    const errors = validateAssetForm({ ...valid, amcStartDate: "2025-01-01", amcEndDate: "2024-12-31" }, reference, TODAY);
    expect(errors.amcEndDate).toBe("Must be on or after the start date");
    expect(
      validateAssetForm({ ...valid, amcStartDate: "2025-01-01", amcEndDate: "2025-01-01" }, reference, TODAY).amcEndDate,
    ).toBeUndefined();
  });

  it("flags a department from a different facility", () => {
    expect(validateAssetForm({ ...valid, custodianDepartmentId: "d2" }, reference, TODAY).custodianDepartmentId).toBe(
      "Pick a department in the selected facility",
    );
  });
});

describe("contractIncrease", () => {
  it("reports a rise from the first year", () => {
    expect(contractIncrease("45000", "50000")).toEqual({ amount: 5000, percentage: 11.11 });
  });
  it("reports nothing when the cost fell, stayed level, or is missing", () => {
    expect(contractIncrease("50000", "45000")).toBeNull();
    expect(contractIncrease("50000", "50000")).toBeNull();
    expect(contractIncrease("", "50000")).toBeNull();
    expect(contractIncrease("0", "50000")).toBeNull();
  });
});

describe("toCreateAssetPayload", () => {
  it("trims text, keeps 0 as 0 and leaves blank optional fields out", () => {
    const payload = toCreateAssetPayload({ ...valid, amcYearsPaid: "0", notes: "  " });
    expect(payload.assetTagNumber).toBe("BME-001");
    expect(payload.purchaseCost).toBe(0);
    expect(payload.amcYearsPaid).toBe(0);
    expect(payload.usefulLifeYears).toBe(10);
    expect(payload.notes).toBeUndefined();
    expect(payload.amcContractNumber).toBeUndefined();
    expect(payload).not.toHaveProperty("organizationId");
  });
});

describe("fieldErrorsFromApi", () => {
  it("puts a duplicate tag error on the tag field", () => {
    const { fields } = fieldErrorsFromApi({ statusCode: 409, message: "This asset tag number is already in use" });
    expect(fields.assetTagNumber).toMatch(/already in use/);
  });

  it("maps validation messages to their fields", () => {
    const { fields, formError } = fieldErrorsFromApi({
      statusCode: 400,
      message: "serialNumber should not be empty; purchaseDate must be a valid ISO 8601 date string; something else",
      details: {
        message: [
          "serialNumber should not be empty",
          "purchaseDate must be a valid ISO 8601 date string",
          "something else",
        ],
      },
    });
    expect(fields).toEqual({ serialNumber: "Required", purchaseDate: "Enter a valid date" });
    expect(formError).toBe("something else");
  });

  it("maps references outside the organization to their pickers", () => {
    const { fields } = fieldErrorsFromApi({
      statusCode: 400,
      details: { message: "Referenced records were not found in your organization", fields: ["currentFacilityId"] },
    });
    expect(fields.currentFacilityId).toMatch(/pick again/i);
  });

  it("falls back to a form-level message", () => {
    expect(fieldErrorsFromApi({ message: "Cannot connect to API server" }).formError).toBe("Cannot connect to API server");
  });
});
