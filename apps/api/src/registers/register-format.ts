import type { AssetStatus, Prisma } from '@prisma/client';

/** One printed column. */
export interface RegisterColumn {
  key: string;
  label: string;
  /** Numbers line up on the right. */
  align?: 'right';
  /** Left blank on screen, for a signature or remark on paper. */
  blank?: boolean;
}

export type RegisterRow = Record<string, string | number | null>;

export interface Register {
  kind: string;
  title: string;
  /** The format it follows, e.g. "NHSRC guidelines, Annexure F". */
  basis: string;
  organization: string;
  /** null: every facility. */
  facility: string | null;
  /** null: as of today (inventory, survey). */
  period: { from: string; to: string } | null;
  /** The device, for a logbook. */
  device: string | null;
  generatedAt: string;
  columns: RegisterColumn[];
  rows: RegisterRow[];
  /** More rows than a register shows; narrow the period or facility. */
  truncated: boolean;
  notes: string[];
}

/** A register stops here; the screen says so. */
export const MAX_ROWS = 5000;

/** "11 Oct 2026", in the hospital's time zone. */
export const day = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(d)
    : null;

/** "11 Oct 2026, 14:30". */
export const dayTime = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d)
    : null;

/** "6.5 h" up to two days, then "3.2 days". */
export function duration(from: Date, to: Date): string {
  const hours = (to.getTime() - from.getTime()) / 3.6e6;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

export const STATUS_LABEL: Record<AssetStatus, string> = {
  ACTIVE: 'Functional',
  IN_SERVICE: 'Functional',
  IN_MAINTENANCE: 'Under repair',
  QUARANTINED: 'Out of use (quarantined)',
  CONDEMNED: 'Condemned (beyond economical repair)',
  RETIRED: 'Retired',
  DISPOSED: 'Disposed',
};

export const PROVIDER_LABEL = {
  IN_HOUSE: 'In-house',
  EXTERNAL_LAB: 'External laboratory',
  VENDOR: 'Manufacturer/vendor',
} as const;

export const name = (u: { firstName: string; lastName: string } | null) =>
  u ? `${u.firstName} ${u.lastName}`.trim() : null;

/** "TAG-1 · ECG machine". */
export const deviceCell = (a: {
  assetTagNumber: string;
  equipmentName: string;
}) => `${a.assetTagNumber} · ${a.equipmentName}`;

/** Prisma Decimal or number to a plain number. */
export const num = (v: Prisma.Decimal | number | null | undefined) =>
  v === null || v === undefined ? null : Number(v);

/** "₹1,25,000". */
export const rupees = (v: number | null) =>
  v === null
    ? null
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(v);

/** Numbers each row: "Sl. No." comes first on every register. */
export const numbered = (rows: RegisterRow[]) =>
  rows.map((r, i) => ({ sl: i + 1, ...r }));

export const SL: RegisterColumn = {
  key: 'sl',
  label: 'Sl. No.',
  align: 'right',
};
