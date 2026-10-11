import { api } from "./client";

export type CalibrationResult = "PASS" | "ADJUSTED" | "FAIL";
export type ServiceProvider = "IN_HOUSE" | "EXTERNAL_LAB" | "VENDOR";

export const RESULT_LABEL: Record<CalibrationResult, string> = {
  PASS: "Passed (within tolerance)",
  ADJUSTED: "Adjusted, now within tolerance",
  FAIL: "Failed (out of tolerance)",
};

export const PROVIDER_LABEL: Record<ServiceProvider, string> = {
  IN_HOUSE: "Our biomed team",
  EXTERNAL_LAB: "External NABL laboratory",
  VENDOR: "Manufacturer or vendor",
};

/** As stated on the certificate (or recorded in-house). Dates are ISO strings. */
export interface CalibrationInput {
  calibratedAt: string;
  provider: ServiceProvider;
  providerName?: string;
  labAccreditationNumber?: string;
  certificateNumber?: string;
  validUntil?: string;
  measurementUncertainty?: string;
  referenceStandards?: string;
  result: CalibrationResult;
  notes?: string;
}

export interface CalibrationRecord {
  id: string;
  assetId: string;
  workOrderId: string | null;
  calibratedAt: string;
  provider: ServiceProvider;
  providerName: string | null;
  labAccreditationNumber: string | null;
  certificateNumber: string | null;
  validUntil: string | null;
  measurementUncertainty: string | null;
  referenceStandards: string | null;
  result: CalibrationResult;
  notes: string | null;
  recordedAt: string;
  recordedBy: string;
  /** Set on a correction: the record it replaced. */
  supersedesId: string | null;
  correctionReason: string | null;
  /** The correction that replaced this record, if any. */
  correctedBy: string | null;
}

/**
 * Must match the API (apps/api/src/calibration/calibration.ts), so staff
 * see the same messages before they send.
 */
export function calibrationProblems(input: CalibrationInput, now = new Date()): string[] {
  const problems: string[] = [];
  const has = (v?: string) => Boolean(v?.trim());
  const calibratedAt = new Date(input.calibratedAt);
  if (Number.isNaN(calibratedAt.getTime())) {
    problems.push("Enter the calibration date");
  } else if (calibratedAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    problems.push("The calibration date cannot be in the future");
  }
  if (input.validUntil && new Date(input.validUntil) <= calibratedAt) {
    problems.push('"Valid until" must be after the calibration date');
  }
  if (input.provider === "EXTERNAL_LAB") {
    if (!has(input.providerName)) problems.push("Name the laboratory");
    if (!has(input.labAccreditationNumber)) problems.push("Enter the laboratory's NABL accreditation number");
    if (!has(input.certificateNumber)) problems.push("Enter the calibration certificate number");
    if (!has(input.measurementUncertainty)) problems.push("Enter the measurement uncertainty stated on the certificate");
  }
  if (input.provider === "VENDOR" && !has(input.providerName)) {
    problems.push("Name the manufacturer or vendor");
  }
  if (input.provider === "IN_HOUSE" && !has(input.referenceStandards)) {
    problems.push("Say which reference equipment was used, and its own calibration");
  }
  if (input.result === "FAIL" && (input.notes?.trim().length ?? 0) < 5) {
    problems.push("Say what was out of tolerance");
  }
  return problems;
}

export async function listCalibrations(assetId: string): Promise<CalibrationRecord[]> {
  const { data } = await api.get<CalibrationRecord[]>(`/assets/${assetId}/calibrations`);
  return data;
}

/** For a calibration with no work order, e.g. an existing certificate. */
export async function recordCalibration(assetId: string, body: CalibrationInput): Promise<CalibrationRecord> {
  const { data } = await api.post<CalibrationRecord>(`/assets/${assetId}/calibrations`, body);
  return data;
}

/** Adds a corrected record that replaces this one; the original is kept. */
export async function correctCalibration(
  id: string,
  body: CalibrationInput & { correctionReason: string },
): Promise<CalibrationRecord> {
  const { data } = await api.post<CalibrationRecord>(`/calibrations/${id}/corrections`, body);
  return data;
}
