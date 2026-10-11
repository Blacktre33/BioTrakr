import type { ServiceProvider } from "./calibration";
import { api } from "./client";
import {
  evaluateSafetyTest,
  type AppliedPartType,
  type ElectricalClass,
  type LeakageMethod,
  type SafetyCheck,
  type SafetyEvaluation,
} from "../iec62353";

export type SafetyTestReason = "ROUTINE" | "AFTER_REPAIR" | "ACCEPTANCE";

export const REASON_LABEL: Record<SafetyTestReason, string> = {
  ROUTINE: "Routine (scheduled)",
  AFTER_REPAIR: "After repair",
  ACCEPTANCE: "Acceptance (new device)",
};

export const CLASS_LABEL: Record<ElectricalClass, string> = {
  CLASS_I: "Class I (earthed)",
  CLASS_II: "Class II (double insulated)",
  INTERNALLY_POWERED: "Internally powered (battery only)",
};

export const APPLIED_PART_LABEL: Record<AppliedPartType, string> = {
  NONE: "No applied parts",
  B: "Type B",
  BF: "Type BF (floating)",
  CF: "Type CF (cardiac)",
};

export const METHOD_LABEL: Record<LeakageMethod, string> = {
  DIRECT: "Direct",
  DIFFERENTIAL: "Differential",
  ALTERNATIVE: "Alternative",
};

/** The test as measured. Pass or fail is never sent: the API works it out. */
export interface SafetyTestInput {
  testedAt: string;
  reason: SafetyTestReason;
  provider: ServiceProvider;
  providerName?: string;
  analyzer: string;
  electricalClass: ElectricalClass;
  appliedPartType: AppliedPartType;
  leakageMethod: LeakageMethod;
  medicalSystem?: boolean;
  mobileXray?: boolean;
  defibrillationPaddles?: boolean;
  visualInspectionPassed: boolean;
  functionalTestPassed: boolean;
  earthResistanceOhm?: number;
  insulationMainsMOhm?: number;
  insulationAppliedMOhm?: number;
  equipmentLeakageUa?: number;
  appliedPartLeakageUa?: number;
  notes?: string;
}

export interface SafetyTestRecord {
  id: string;
  assetId: string;
  workOrderId: string | null;
  testedAt: string;
  reason: SafetyTestReason;
  provider: ServiceProvider;
  providerName: string | null;
  analyzer: string;
  electricalClass: ElectricalClass;
  appliedPartType: AppliedPartType;
  leakageMethod: LeakageMethod;
  medicalSystem: boolean;
  mobileXray: boolean;
  defibrillationPaddles: boolean;
  visualInspectionPassed: boolean;
  functionalTestPassed: boolean;
  earthResistanceOhm: number | null;
  insulationMainsMOhm: number | null;
  insulationAppliedMOhm: number | null;
  equipmentLeakageUa: number | null;
  appliedPartLeakageUa: number | null;
  passed: boolean;
  /** Each reading against its limit, as the API judged it. */
  checks: SafetyCheck[];
  notes: string | null;
  recordedAt: string;
  recordedBy: string;
  supersedesId: string | null;
  correctionReason: string | null;
  correctedBy: string | null;
  /** Files attached and not withdrawn (the certificate or report). */
  documents: number;
}

/**
 * Must match the API (apps/api/src/safety-tests/safety-test.ts), so staff
 * see the same messages before they send.
 */
export function safetyTestProblems(
  input: SafetyTestInput,
  now = new Date(),
): { problems: string[]; evaluation: SafetyEvaluation } {
  const problems: string[] = [];
  const testedAt = new Date(input.testedAt);
  if (Number.isNaN(testedAt.getTime())) {
    problems.push("Enter the test date");
  } else if (testedAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    problems.push("The test date cannot be in the future");
  }
  if (input.provider !== "IN_HOUSE" && !input.providerName?.trim()) {
    problems.push(input.provider === "EXTERNAL_LAB" ? "Name the laboratory" : "Name the manufacturer or vendor");
  }
  if (input.analyzer.trim().length < 3) problems.push("Say which safety analyser was used");
  const evaluation = evaluateSafetyTest(input);
  problems.push(...evaluation.missing);
  return { problems, evaluation };
}

export async function listSafetyTests(assetId: string): Promise<SafetyTestRecord[]> {
  const { data } = await api.get<SafetyTestRecord[]>(`/assets/${assetId}/safety-tests`);
  return data;
}

/** For a test with no work order, e.g. after a repair or at acceptance. */
export async function recordSafetyTest(assetId: string, body: SafetyTestInput): Promise<SafetyTestRecord> {
  const { data } = await api.post<SafetyTestRecord>(`/assets/${assetId}/safety-tests`, body);
  return data;
}

/** Adds a corrected record that replaces this one; the original is kept. */
export async function correctSafetyTest(
  id: string,
  body: SafetyTestInput & { correctionReason: string },
): Promise<SafetyTestRecord> {
  const { data } = await api.post<SafetyTestRecord>(`/safety-tests/${id}/corrections`, body);
  return data;
}
