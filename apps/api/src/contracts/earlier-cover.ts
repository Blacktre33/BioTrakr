import type { ContractType } from '@prisma/client';

/** Where the old device form appended CMC (and extra AMC) details to the notes. */
const MARK = '[CONTRACT_TRACKING]';

type Tracked = Record<string, unknown>;

/** The JSON block the old device form left in the notes, if any. */
export function trackedInNotes(
  notes: string | null | undefined,
): { amc?: Tracked; cmc?: Tracked } | null {
  const at = notes?.indexOf(MARK) ?? -1;
  if (!notes || at < 0) return null;
  const rest = notes.slice(at + MARK.length);
  const start = rest.indexOf('{');
  if (start < 0) return null;
  // Text typed after the block is ignored: parse up to its last brace.
  for (let end = rest.lastIndexOf('}'); end > start; ) {
    try {
      const value: unknown = JSON.parse(rest.slice(start, end + 1));
      return value && typeof value === 'object'
        ? (value as { amc?: Tracked; cmc?: Tracked })
        : null;
    } catch {
      end = rest.lastIndexOf('}', end - 1);
    }
  }
  return null;
}

const text = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
const date = (v: unknown) => {
  if (v instanceof Date) return v;
  const d = typeof v === 'string' && v.trim() ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const amount = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n)
    ? n
    : null;
};

export interface EarlierCover {
  contractType: ContractType;
  vendor: { id: string; vendorName: string } | null;
  contractNumber: string | null;
  startDate: Date | null;
  endDate: Date | null;
  annualValue: number | null;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * AMC and CMC details typed on the device before contracts had their own
 * records: the AMC columns, and the CMC block the old form put in the
 * notes. One already entered as a contract (same kind, and the same number
 * or end date) is left out.
 */
export function earlierCover(
  asset: {
    amcContractNumber: string | null;
    amcStartDate: Date | null;
    amcEndDate: Date | null;
    amcCostAnnual: unknown;
    amcProvider: { id: string; vendorName: string } | null;
    cmcProvider: { id: string; vendorName: string } | null;
    notes: string | null;
  },
  contracts: Array<{
    contractType: ContractType;
    contractNumber: string;
    endDate: Date;
  }>,
): EarlierCover[] {
  const tracked = trackedInNotes(asset.notes);
  const cmc = tracked?.cmc ?? {};
  const found: EarlierCover[] = [
    {
      contractType: 'AMC',
      vendor: asset.amcProvider,
      contractNumber: text(asset.amcContractNumber),
      startDate: date(asset.amcStartDate),
      endDate: date(asset.amcEndDate),
      annualValue: amount(asset.amcCostAnnual),
    },
    {
      contractType: 'CMC',
      vendor: asset.cmcProvider,
      contractNumber: text(cmc.contractNumber),
      startDate: date(cmc.startDate),
      endDate: date(cmc.endDate),
      annualValue: amount(cmc.costAnnual),
    },
  ];
  return found.filter(
    (e) =>
      (e.contractNumber || e.endDate) &&
      !contracts.some(
        (c) =>
          c.contractType === e.contractType &&
          ((e.contractNumber &&
            c.contractNumber.trim().toLowerCase() ===
              e.contractNumber.toLowerCase()) ||
            (e.endDate && sameDay(c.endDate, e.endDate))),
      ),
  );
}
