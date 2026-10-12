import type { CondemnationEvidence, CondemnationReason, DisposalMethod } from "@/lib/api/condemnation";
import { hoursText } from "@/lib/downtime";
import { formatCurrency } from "@/lib/utils";

/** "9 of 10 years old · bought for ₹2,50,000 · book value ₹47,500 · 2 breakdowns, 5 days out of use in the last year". */
export function evidenceText(e: CondemnationEvidence): string {
  return [
    `${e.ageYears} of ${e.usefulLifeYears} years old`,
    `bought for ${formatCurrency(e.purchaseCost)}`,
    `book value ${formatCurrency(e.bookValue)}`,
    e.breakdowns === 0
      ? "no breakdowns in the last year"
      : `${e.breakdowns} ${e.breakdowns === 1 ? "breakdown" : "breakdowns"}, ${hoursText(e.downtimeHours)} out of use in the last year`,
  ].join(" · ");
}

/** What a repair would cost as a share of the value, in per cent (as the API works it out). */
export function repairShare(repair: number | null, value: number | null): number | null {
  if (repair === null || value === null || value <= 0) return null;
  return Math.round((repair / value) * 100);
}

/** Must match the API's clearanceNeeded (condemnation/condemnation.ts). */
export function clearanceNeeded(kind: "aerb" | "pc-pndt" | null | undefined, method: DisposalMethod): boolean {
  if (kind === "aerb") return true;
  if (kind === "pc-pndt") return method !== "E_WASTE_RECYCLER";
  return false;
}

/** "" is no amount; anything else must be rupees. */
export const amount = (text: string): number | null | undefined => {
  const t = text.replace(/[,\s₹]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export interface ProposalValues {
  reasons: CondemnationReason[];
  justification: string;
  repairEstimate: string;
  currentValue: string;
}

/** The same checks the API makes, per field. */
export function proposalErrors(v: ProposalValues): Partial<Record<keyof ProposalValues, string>> {
  const errors: Partial<Record<keyof ProposalValues, string>> = {};
  if (v.reasons.length === 0) errors.reasons = "Give at least one reason";
  if (v.justification.trim().length < 20) {
    errors.justification = "Explain why the device should be condemned (a sentence or two)";
  }
  if (amount(v.repairEstimate) === undefined) errors.repairEstimate = "Enter an amount in rupees";
  if (amount(v.currentValue) === undefined) errors.currentValue = "Enter an amount in rupees";
  return errors;
}

/** Today here, as the date input wants it. */
export const todayValue = () => new Date().toLocaleDateString("en-CA");
