import type { CondemnationStatus, DisposalMethod } from '@prisma/client';

/** Why a device is put up for condemnation. */
export const CONDEMNATION_REASONS = {
  beyond_economic_repair: 'Beyond economic repair',
  end_of_life: 'Past its useful life',
  obsolete: 'Obsolete technology',
  no_spares: 'Spares or service no longer available',
  unsafe: 'Unsafe, and cannot be made safe',
  damaged: 'Damaged beyond repair',
  other: 'Other',
} as const;
export type CondemnationReason = keyof typeof CONDEMNATION_REASONS;
export const REASON_KEYS = Object.keys(
  CONDEMNATION_REASONS,
) as CondemnationReason[];

export const reasonsText = (reasons: string[]) =>
  reasons
    .map((r) => CONDEMNATION_REASONS[r as CondemnationReason] ?? r)
    .join('; ');

export const DISPOSAL_LABEL: Record<DisposalMethod, string> = {
  E_WASTE_RECYCLER: 'Authorised e-waste recycler',
  BUYBACK: 'Buyback against a new purchase',
  AUCTION: 'Auction',
  TRANSFER: 'Transfer to another institution',
  OTHER: 'Other',
};

export const STATUS_TEXT: Record<CondemnationStatus, string> = {
  PROPOSED: 'Waiting for the committee',
  APPROVED: 'Condemned, waiting for disposal',
  REJECTED: 'Rejected by the committee',
  WITHDRAWN: 'Withdrawn',
  DISPOSED: 'Disposed of',
};

/** A device has at most one of these at a time. */
export const OPEN_CONDEMNATION: CondemnationStatus[] = ['PROPOSED', 'APPROVED'];

const YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Years since a date, to one decimal. */
export const ageYears = (from: Date, at: Date) =>
  Math.max(0, Math.round(((at.getTime() - from.getTime()) / YEAR) * 10) / 10);

/**
 * Straight-line book value (NHSRC guidelines): the cost less an equal share
 * of (cost - salvage) for each year of use, never below the salvage value.
 */
export function bookValue(
  a: {
    purchaseCost: number;
    salvageValue: number;
    usefulLifeYears: number;
    purchaseDate: Date;
  },
  at: Date,
): number {
  const salvage = Math.min(a.salvageValue, a.purchaseCost);
  if (a.usefulLifeYears <= 0) return salvage;
  const used = Math.max(0, (at.getTime() - a.purchaseDate.getTime()) / YEAR);
  const share = Math.min(1, used / a.usefulLifeYears);
  return Math.round(a.purchaseCost - (a.purchaseCost - salvage) * share);
}

/** What a repair would cost as a share of the device's value, in per cent. */
export function repairShare(
  repairEstimate: number | null,
  value: number | null,
): number | null {
  if (repairEstimate === null || value === null || value <= 0) return null;
  return Math.round((repairEstimate / value) * 100);
}

/** What the device's record said when it was proposed. */
export interface CondemnationEvidence {
  ageYears: number;
  usefulLifeYears: number;
  purchaseCost: number;
  /** Straight-line, on the day of the proposal. */
  bookValue: number;
  /** Breakdowns reported in the year before the proposal. */
  breakdowns: number;
  /** Hours those breakdowns kept it out of use. */
  downtimeHours: number;
}

/** Equipment a regulator must clear before it leaves the hospital. */
export type Clearance = 'aerb' | 'pc-pndt';

const RADIATION =
  /\b(x-?ray|radiograph\w*|ct|cbct|ct scan\w*|computed tomograph\w*|c-?arm|fluoroscop\w*|mammo\w*|cath ?lab|angiograph\w*|dexa|bone densitometer|opg|orthopantomo\w*|linac|linear accelerator|brachytherapy|cobalt|gamma camera|spect|pet)\b/i;
const ULTRASOUND =
  /\b(ultrasound|ultra sound|ultrasonograph\w*|sonograph\w*|usg|echocardiograph\w*)\b/i;

/**
 * X-ray and other radiation equipment needs AERB's decommissioning
 * approval; an ultrasound machine needs a NOC from the PC-PNDT Appropriate
 * Authority before it is sold or transferred (NHSRC guidelines).
 */
export function clearanceFor(equipmentName: string): Clearance | null {
  if (RADIATION.test(equipmentName)) return 'aerb';
  if (ULTRASOUND.test(equipmentName)) return 'pc-pndt';
  return null;
}

export const CLEARANCE_TEXT: Record<Clearance, string> = {
  aerb: "Radiation equipment leaves the hospital only with AERB's decommissioning approval (through eLORA).",
  'pc-pndt':
    'An ultrasound machine is sold or transferred only with a NOC from the PC-PNDT Appropriate Authority.',
};

/** Whether this disposal needs the regulator's clearance on record. */
export function clearanceNeeded(
  clearance: Clearance | null,
  method: DisposalMethod,
): boolean {
  if (clearance === 'aerb') return true;
  // Destroyed by a recycler, an ultrasound machine is neither sold nor transferred.
  if (clearance === 'pc-pndt') return method !== 'E_WASTE_RECYCLER';
  return false;
}
