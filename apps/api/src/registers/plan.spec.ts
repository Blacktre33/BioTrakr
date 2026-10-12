import {
  comingYear,
  everyText,
  planCells,
  planMonths,
  type PlanSchedule,
} from './plan';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const now = at(2026, 10, 12);
const months = planMonths(at(2026, 10, 1), at(2027, 9, 30));

describe('planMonths', () => {
  it('names each calendar month the period touches', () => {
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ key: 'm2026-10', label: 'Oct 2026' });
    expect(months[11]).toMatchObject({ key: 'm2027-09', label: 'Sept 2027' });
    // 12 Oct to 11 Oct touches thirteen months.
    expect(planMonths(at(2026, 10, 12), at(2027, 10, 11))).toHaveLength(13);
  });

  it('comingYear runs from the start of this month for twelve months', () => {
    const { from, to } = comingYear(now);
    expect(from).toEqual(at(2026, 10, 1));
    expect(to.getFullYear()).toBe(2027);
    expect(to.getMonth()).toBe(8);
    expect(to.getDate()).toBe(30);
  });
});

it('everyText names the usual intervals', () => {
  expect(everyText(90)).toBe('quarterly');
  expect(everyText(365)).toBe('yearly');
  expect(everyText(45)).toBe('every 45 days');
});

describe('planCells', () => {
  const pm = (fields: Partial<PlanSchedule>): PlanSchedule => ({
    kind: 'PM',
    every: 90,
    next: at(2026, 11, 15),
    done: [],
    ...fields,
  });

  it('plans each visit at the interval from the next due date', () => {
    expect(planCells([pm({})], months, now)).toEqual({
      'm2026-11': 'PM 15',
      'm2027-02': 'PM 13',
      'm2027-05': 'PM 14',
      'm2027-08': 'PM 12',
    });
  });

  it('shows what was done, and work past its due date this month', () => {
    const cells = planCells(
      [
        pm({ next: at(2026, 9, 20), done: [] }),
        {
          kind: 'Calibration',
          every: 365,
          next: at(2027, 10, 3),
          done: [at(2026, 10, 3)],
        },
        { kind: 'Safety test', every: null, next: at(2027, 1, 20), done: [] },
      ],
      months,
      now,
    );
    expect(cells['m2026-10']).toBe('Cal done 3, PM overdue');
    // Overdue: the next visit is planned an interval after today.
    expect(cells['m2027-01']).toBe('PM 10, EST 20');
    expect(cells['m2027-04']).toBe('PM 10');
    expect(Object.keys(cells)).toHaveLength(4);
  });

  it('reads two records of the same work on the same day once', () => {
    const twice = [at(2026, 10, 3), at(2026, 10, 3)];
    expect(planCells([pm({ next: null, done: twice })], months, now)).toEqual({
      'm2026-10': 'PM done 3',
    });
  });

  it('copes with no schedule, no interval and a zero interval', () => {
    expect(planCells([pm({ next: null })], months, now)).toEqual({});
    expect(planCells([pm({ every: null })], months, now)).toEqual({
      'm2026-11': 'PM 15',
    });
    expect(planCells([pm({ every: 0 })], months, now)).toEqual({
      'm2026-11': 'PM 15',
    });
  });
});
