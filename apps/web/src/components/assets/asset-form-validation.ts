import type { CreateAssetPayload } from "@/lib/api/assets";
import type { AssetFormReference } from "@/lib/api/reference";

/** Everything the asset form holds, as the strings the inputs produce. */
export interface AssetFormValues {
  assetTagNumber: string;
  equipmentName: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  deviceCategory: string;
  assetStatus: string;
  criticalityLevel: string;
  riskClassification: string;
  currentFacilityId: string;
  custodianDepartmentId: string;
  primaryCustodianId: string;
  purchaseDate: string;
  purchaseCost: string;
  usefulLifeYears: string;
  amcContractNumber: string;
  amcStartDate: string;
  amcEndDate: string;
  amcInitialCost: string;
  amcCostAnnual: string;
  amcYearsPaid: string;
  cmcContractNumber: string;
  cmcStartDate: string;
  cmcEndDate: string;
  cmcInitialCost: string;
  cmcCostAnnual: string;
  cmcYearsPaid: string;
  notes: string;
}

export type AssetField = keyof AssetFormValues;
export type FieldErrors = Partial<Record<AssetField, string>>;

export const EMPTY_ASSET_FORM: AssetFormValues = {
  assetTagNumber: "",
  equipmentName: "",
  manufacturer: "",
  modelNumber: "",
  serialNumber: "",
  // Category, criticality and risk class drive PM schedules and compliance
  // reports, so they are chosen deliberately rather than pre-filled.
  deviceCategory: "",
  assetStatus: "ACTIVE",
  criticalityLevel: "",
  riskClassification: "",
  currentFacilityId: "",
  custodianDepartmentId: "",
  primaryCustodianId: "",
  purchaseDate: "",
  purchaseCost: "",
  usefulLifeYears: "10",
  amcContractNumber: "",
  amcStartDate: "",
  amcEndDate: "",
  amcInitialCost: "",
  amcCostAnnual: "",
  amcYearsPaid: "",
  cmcContractNumber: "",
  cmcStartDate: "",
  cmcEndDate: "",
  cmcInitialCost: "",
  cmcCostAnnual: "",
  cmcYearsPaid: "",
  notes: "",
};

/** Required by the API (CreateAssetDto). Order is the order fields appear on screen. */
export const REQUIRED_FIELDS: AssetField[] = [
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
];

/** On-screen order, used to focus the first field with a problem. */
export const FIELD_ORDER: AssetField[] = Object.keys(EMPTY_ASSET_FORM) as AssetField[];

const MAX_TEXT = 100;
const MAX_USEFUL_LIFE_YEARS = 50;

function parseNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

/** "YYYY-MM-DD" from a date input, compared as calendar dates in local time. */
function isFutureDate(raw: string, today: Date): boolean {
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  return raw > todayStr;
}

function isValidDate(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw));
}

/**
 * Checks the whole form and returns a message per field with a problem.
 * Messages are short and say what to do, since they appear right under the field.
 */
export function validateAssetForm(
  values: AssetFormValues,
  reference?: Pick<AssetFormReference, "departments"> | null,
  today: Date = new Date(),
): FieldErrors {
  const errors: FieldErrors = {};

  for (const field of REQUIRED_FIELDS) {
    if (values[field].trim() === "") errors[field] = "Required";
  }

  for (const field of [
    "assetTagNumber",
    "equipmentName",
    "manufacturer",
    "modelNumber",
    "serialNumber",
  ] as const) {
    if (!errors[field] && values[field].trim().length > MAX_TEXT) {
      errors[field] = `Keep this under ${MAX_TEXT} characters`;
    }
  }

  if (!errors.purchaseDate) {
    if (!isValidDate(values.purchaseDate)) {
      errors.purchaseDate = "Enter a valid date";
    } else if (isFutureDate(values.purchaseDate, today)) {
      errors.purchaseDate = "Can't be in the future";
    }
  }

  const amountFields: AssetField[] = ["purchaseCost", "amcInitialCost", "amcCostAnnual", "cmcInitialCost", "cmcCostAnnual"];
  for (const field of amountFields) {
    if (errors[field]) continue;
    const n = parseNumber(values[field]);
    if (n !== null && (Number.isNaN(n) || n < 0)) errors[field] = "Enter an amount of 0 or more";
  }

  if (!errors.usefulLifeYears) {
    const years = parseNumber(values.usefulLifeYears);
    if (years === null || Number.isNaN(years) || !Number.isInteger(years) || years < 1 || years > MAX_USEFUL_LIFE_YEARS) {
      errors.usefulLifeYears = `Whole number of years, 1 to ${MAX_USEFUL_LIFE_YEARS}`;
    }
  }

  for (const field of ["amcYearsPaid", "cmcYearsPaid"] as const) {
    const n = parseNumber(values[field]);
    if (n !== null && (Number.isNaN(n) || !Number.isInteger(n) || n < 0)) {
      errors[field] = "Whole number, 0 or more";
    }
  }

  for (const prefix of ["amc", "cmc"] as const) {
    const start = values[`${prefix}StartDate`];
    const end = values[`${prefix}EndDate`];
    if (start && !isValidDate(start)) errors[`${prefix}StartDate`] = "Enter a valid date";
    if (end && !isValidDate(end)) errors[`${prefix}EndDate`] = "Enter a valid date";
    if (start && end && isValidDate(start) && isValidDate(end) && end < start) {
      errors[`${prefix}EndDate`] = "Must be on or after the start date";
    }
  }

  // The department list is filtered by facility, but a facility change can
  // leave an old choice behind.
  if (reference && values.custodianDepartmentId && values.currentFacilityId) {
    const dept = reference.departments.find((d) => d.id === values.custodianDepartmentId);
    if (dept && dept.facilityId !== values.currentFacilityId) {
      errors.custodianDepartmentId = "Pick a department in the selected facility";
    }
  }

  return errors;
}

/** Cost increase from the first contract year to the current one, if it went up. */
export function contractIncrease(
  initialRaw: string,
  currentRaw: string,
): { amount: number; percentage: number } | null {
  const initial = parseNumber(initialRaw);
  const current = parseNumber(currentRaw);
  if (initial === null || current === null || Number.isNaN(initial) || Number.isNaN(current)) return null;
  if (initial <= 0 || current <= initial) return null;
  const amount = Math.round((current - initial) * 100) / 100;
  return { amount, percentage: Math.round((amount / initial) * 10000) / 100 };
}

const text = (raw: string) => (raw.trim() === "" ? undefined : raw.trim());
const num = (raw: string) => {
  const n = parseNumber(raw);
  return n === null || Number.isNaN(n) ? undefined : n;
};

/** Converts valid form values into the API payload. 0 stays 0. */
export function toCreateAssetPayload(values: AssetFormValues): CreateAssetPayload {
  const amc = contractIncrease(values.amcInitialCost, values.amcCostAnnual);
  const cmc = contractIncrease(values.cmcInitialCost, values.cmcCostAnnual);

  return {
    assetTagNumber: values.assetTagNumber.trim(),
    equipmentName: values.equipmentName.trim(),
    manufacturer: values.manufacturer.trim(),
    modelNumber: values.modelNumber.trim(),
    serialNumber: values.serialNumber.trim(),
    deviceCategory: values.deviceCategory,
    assetStatus: values.assetStatus || undefined,
    criticalityLevel: values.criticalityLevel,
    riskClassification: values.riskClassification,
    purchaseDate: values.purchaseDate,
    purchaseCost: num(values.purchaseCost) ?? 0,
    usefulLifeYears: num(values.usefulLifeYears) ?? 0,
    currentFacilityId: values.currentFacilityId,
    custodianDepartmentId: values.custodianDepartmentId,
    primaryCustodianId: values.primaryCustodianId,
    amcContractNumber: text(values.amcContractNumber),
    amcStartDate: text(values.amcStartDate),
    amcEndDate: text(values.amcEndDate),
    amcInitialCost: num(values.amcInitialCost),
    amcCostAnnual: num(values.amcCostAnnual),
    amcYearsPaid: num(values.amcYearsPaid),
    amcIncreaseAmount: amc?.amount,
    amcIncreasePercentage: amc?.percentage,
    cmcContractNumber: text(values.cmcContractNumber),
    cmcStartDate: text(values.cmcStartDate),
    cmcEndDate: text(values.cmcEndDate),
    cmcInitialCost: num(values.cmcInitialCost),
    cmcCostAnnual: num(values.cmcCostAnnual),
    cmcYearsPaid: num(values.cmcYearsPaid),
    cmcIncreaseAmount: cmc?.amount,
    cmcIncreasePercentage: cmc?.percentage,
    notes: text(values.notes),
  };
}

function friendlyServerMessage(rest: string): string {
  if (/should not be empty/.test(rest)) return "Required";
  if (/ISO 8601 date/.test(rest)) return "Enter a valid date";
  if (/must not be less than 0/.test(rest)) return "Enter an amount of 0 or more";
  if (/must be one of the following values/.test(rest)) return "Pick one of the options";
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * Turns an API error into messages under the right fields, so staff see
 * what to fix where they are looking rather than in a toast that vanishes.
 */
export function fieldErrorsFromApi(error: unknown): { fields: FieldErrors; formError?: string } {
  const err = error as { statusCode?: number; message?: string; details?: unknown };
  const details = (err?.details ?? {}) as { message?: unknown; fields?: unknown };
  const fields: FieldErrors = {};
  const isField = (name: string): name is AssetField => name in EMPTY_ASSET_FORM;

  if (err?.statusCode === 409) {
    fields.assetTagNumber = "This tag is already in use. Check the label, or use a different tag.";
    return { fields };
  }

  if (Array.isArray(details.fields)) {
    for (const name of details.fields) {
      if (typeof name === "string" && isField(name)) {
        fields[name] = "Not found in your organization. Please pick again.";
      }
    }
  }

  const unmatched: string[] = [];
  if (Array.isArray(details.message)) {
    for (const message of details.message) {
      if (typeof message !== "string") continue;
      const [name, ...rest] = message.split(" ");
      if (isField(name)) {
        fields[name] ??= friendlyServerMessage(rest.join(" "));
      } else {
        unmatched.push(message);
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    return { fields, formError: unmatched.length > 0 ? unmatched.join("; ") : undefined };
  }
  return { fields, formError: err?.message || "Could not save the asset. Please try again." };
}
