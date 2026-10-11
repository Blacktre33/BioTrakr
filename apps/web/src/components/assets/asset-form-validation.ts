import type { CreateAssetPayload } from "@/lib/api/assets";
import type { AppliedPartType, ElectricalClass } from "@/lib/iec62353";
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
  pmFrequencyDays: string;
  lastPmDate: string;
  /** "yes" when the device needs periodic calibration. */
  requiresCalibration: string;
  calibrationFrequencyDays: string;
  nextCalibrationDue: string;
  /** "yes" when the device needs periodic electrical safety tests. */
  requiresSafetyTest: string;
  safetyTestFrequencyDays: string;
  nextSafetyInspectionDue: string;
  /** "" when not known yet. */
  electricalClass: string;
  appliedPartType: string;
  warrantyStartDate: string;
  warrantyEndDate: string;
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
  pmFrequencyDays: "",
  lastPmDate: "",
  requiresCalibration: "",
  calibrationFrequencyDays: "365",
  nextCalibrationDue: "",
  requiresSafetyTest: "",
  safetyTestFrequencyDays: "365",
  nextSafetyInspectionDue: "",
  electricalClass: "",
  appliedPartType: "",
  warrantyStartDate: "",
  warrantyEndDate: "",
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

  if (!errors.purchaseCost) {
    const n = parseNumber(values.purchaseCost);
    if (n !== null && (Number.isNaN(n) || n < 0)) errors.purchaseCost = "Enter an amount of 0 or more";
  }

  if (!errors.usefulLifeYears) {
    const years = parseNumber(values.usefulLifeYears);
    if (years === null || Number.isNaN(years) || !Number.isInteger(years) || years < 1 || years > MAX_USEFUL_LIFE_YEARS) {
      errors.usefulLifeYears = `Whole number of years, 1 to ${MAX_USEFUL_LIFE_YEARS}`;
    }
  }

  // PM interval: optional, but without it the device never shows as due.
  const pmDays = parseNumber(values.pmFrequencyDays);
  if (pmDays !== null && (Number.isNaN(pmDays) || !Number.isInteger(pmDays) || pmDays < 1 || pmDays > 3650)) {
    errors.pmFrequencyDays = "Whole number of days, 1 to 3650";
  }
  if (values.lastPmDate) {
    if (!isValidDate(values.lastPmDate)) errors.lastPmDate = "Enter a valid date";
    else if (isFutureDate(values.lastPmDate, today)) errors.lastPmDate = "Cannot be in the future";
  }

  if (values.requiresCalibration === "yes") {
    const calDays = parseNumber(values.calibrationFrequencyDays);
    if (calDays !== null && (Number.isNaN(calDays) || !Number.isInteger(calDays) || calDays < 1 || calDays > 3650)) {
      errors.calibrationFrequencyDays = "Whole number of days, 1 to 3650";
    }
    if (values.nextCalibrationDue && !isValidDate(values.nextCalibrationDue)) {
      errors.nextCalibrationDue = "Enter a valid date";
    }
  }

  if (values.requiresSafetyTest === "yes") {
    const days = parseNumber(values.safetyTestFrequencyDays);
    if (days !== null && (Number.isNaN(days) || !Number.isInteger(days) || days < 1 || days > 3650)) {
      errors.safetyTestFrequencyDays = "Whole number of days, 1 to 3650";
    }
    if (values.nextSafetyInspectionDue && !isValidDate(values.nextSafetyInspectionDue)) {
      errors.nextSafetyInspectionDue = "Enter a valid date";
    }
  }

  const { warrantyStartDate: wStart, warrantyEndDate: wEnd } = values;
  if (wStart && !isValidDate(wStart)) errors.warrantyStartDate = "Enter a valid date";
  if (wEnd && !isValidDate(wEnd)) errors.warrantyEndDate = "Enter a valid date";
  if (wStart && wEnd && isValidDate(wStart) && isValidDate(wEnd) && wEnd < wStart) {
    errors.warrantyEndDate = "Must be on or after the start date";
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

const text = (raw: string) => (raw.trim() === "" ? undefined : raw.trim());
const num = (raw: string) => {
  const n = parseNumber(raw);
  return n === null || Number.isNaN(n) ? undefined : n;
};

/** Converts valid form values into the API payload. 0 stays 0. */
export function toCreateAssetPayload(values: AssetFormValues): CreateAssetPayload {
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
    pmFrequencyDays: num(values.pmFrequencyDays),
    lastPmDate: text(values.lastPmDate),
    ...(values.requiresCalibration === "yes"
      ? {
          requiresCalibration: true,
          calibrationFrequencyDays: num(values.calibrationFrequencyDays),
          nextCalibrationDue: text(values.nextCalibrationDue),
        }
      : {}),
    ...(values.requiresSafetyTest === "yes"
      ? {
          requiresSafetyTest: true,
          safetyTestFrequencyDays: num(values.safetyTestFrequencyDays),
          nextSafetyInspectionDue: text(values.nextSafetyInspectionDue),
        }
      : {}),
    electricalClass: (values.electricalClass || undefined) as ElectricalClass | undefined,
    appliedPartType: (values.appliedPartType || undefined) as AppliedPartType | undefined,
    currentFacilityId: values.currentFacilityId,
    custodianDepartmentId: values.custodianDepartmentId,
    primaryCustodianId: values.primaryCustodianId,
    warrantyStartDate: text(values.warrantyStartDate),
    warrantyEndDate: text(values.warrantyEndDate),
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
