const DAY = 24 * 60 * 60 * 1000;

/** A plan covers at most this many calendar months. */
export const MAX_PLAN_MONTHS = 13;

export type PlanKind = 'PM' | 'Calibration' | 'Safety test';

/** One kind of scheduled work on a device. */
export interface PlanSchedule {
  kind: PlanKind;
  /** Days between visits; null: a single due date. */
  every: number | null;
  /** When it next falls due; null: not scheduled. */
  next: Date | null;
  /** When it was done, in the period. */
  done: Date[];
}

export interface PlanMonth {
  key: string;
  label: string;
  start: Date;
  /** The first moment of the next month. */
  end: Date;
}

/** The calendar months a period touches, here. */
export function planMonths(from: Date, to: Date): PlanMonth[] {
  const months: PlanMonth[] = [];
  let start = new Date(from.getFullYear(), from.getMonth(), 1);
  while (start <= to) {
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    months.push({
      key: `m${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('en-IN', {
        month: 'short',
        year: 'numeric',
      }).format(start),
      start,
      end,
    });
    start = end;
  }
  return months;
}

/** The year from the start of this month. */
export function comingYear(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 12, 0, 23, 59, 59, 999),
  };
}

/** "every 90 days", "yearly". */
export function everyText(days: number): string {
  const named: Record<number, string> = {
    30: 'monthly',
    31: 'monthly',
    90: 'quarterly',
    91: 'quarterly',
    180: 'six-monthly',
    182: 'six-monthly',
    183: 'six-monthly',
    365: 'yearly',
    730: 'every two years',
  };
  return named[days] ?? `every ${days} days`;
}

const SHORT: Record<PlanKind, string> = {
  PM: 'PM',
  Calibration: 'Cal',
  'Safety test': 'EST',
};

/**
 * What each month holds for one device: work done in past months ("PM done
 * 12"), work due from today on ("PM 15", every interval after the next due
 * date), and work already overdue, shown this month ("PM overdue").
 */
export function planCells(
  schedules: PlanSchedule[],
  months: PlanMonth[],
  now: Date,
): Record<string, string> {
  if (months.length === 0) return {};
  const first = months[0].start;
  const last = months[months.length - 1].end;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entries: Array<{ at: Date; text: string }> = [];
  for (const s of schedules) {
    const short = SHORT[s.kind];
    const every = s.every && s.every > 0 ? s.every : null;
    for (const d of s.done) {
      if (d >= first && d < last) {
        entries.push({ at: d, text: `${short} done ${d.getDate()}` });
      }
    }
    if (!s.next) continue;
    let due: Date | null = s.next;
    if (due < today) {
      entries.push({ at: today, text: `${short} overdue` });
      due = every ? new Date(today.getTime() + every * DAY) : null;
    }
    while (due && due < last) {
      if (due >= first)
        entries.push({ at: due, text: `${short} ${due.getDate()}` });
      due = every ? new Date(due.getTime() + every * DAY) : null;
    }
  }
  const cells: Record<string, string> = {};
  for (const m of months) {
    const here = entries
      .filter((e) => e.at >= m.start && e.at < m.end)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    // Two records of the same work on the same day read once.
    if (here.length)
      cells[m.key] = [...new Set(here.map((e) => e.text))].join(', ');
  }
  return cells;
}
