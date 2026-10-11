/**
 * Dates and status for warranties and service contracts. A contract's end
 * date is its last day of cover, so cover runs to the end of that day.
 * Days are counted in the server's time zone (TZ: the hospital's).
 */

export const DAY = 24 * 60 * 60 * 1000;

/** Contracts and warranties ending within this many days are "ending soon". */
export const ENDING_SOON_DAYS = 90;

/** Notices go out as the end date comes within each of these many days. */
export const CONTRACT_NOTICE_DAYS = [90, 60, 30, 7, 0];
export const WARRANTY_NOTICE_DAYS = [90, 30, 0];
/** An end date further in the past than this gets no notice: it is old news. */
export const NOTICE_GRACE_DAYS = 7;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(startOfDay(d).getTime() + DAY - 1);
}

/** Whole days from today to the given day: 0 today, negative once past. */
export function daysUntil(day: Date, now: Date = new Date()): number {
  // Rounded: a day is 23 or 25 hours when the clocks change.
  return Math.round(
    (startOfDay(day).getTime() - startOfDay(now).getTime()) / DAY,
  );
}

export type ContractStatus = 'upcoming' | 'active' | 'expired' | 'terminated';

export function contractStatus(
  c: { startDate: Date; endDate: Date; terminatedAt: Date | null },
  now: Date = new Date(),
): ContractStatus {
  if (c.terminatedAt) return 'terminated';
  if (daysUntil(c.startDate, now) > 0) return 'upcoming';
  if (daysUntil(c.endDate, now) < 0) return 'expired';
  return 'active';
}

/**
 * The notice threshold the end date has most recently come within (e.g. 30
 * when 12 days are left), or null when no notice is due: still more than
 * the largest threshold away, or ended too long ago.
 */
export function noticeThreshold(
  daysLeft: number,
  thresholds: number[],
): number | null {
  if (daysLeft < -NOTICE_GRACE_DAYS) return null;
  const crossed = thresholds.filter((t) => daysLeft <= t);
  return crossed.length ? Math.min(...crossed) : null;
}

/** "ends in 12 days", "ends today", "ended 3 days ago". */
export function describeEnd(daysLeft: number): string {
  if (daysLeft > 1) return `ends in ${daysLeft} days`;
  if (daysLeft === 1) return 'ends tomorrow';
  if (daysLeft === 0) return 'ends today';
  if (daysLeft === -1) return 'ended yesterday';
  return `ended ${-daysLeft} days ago`;
}

/** "1 Apr 2026", for messages. */
export const formatDate = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
