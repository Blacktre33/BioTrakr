import { nextPmDue } from './pm-dates';

describe('nextPmDue', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it('is one interval after the last PM', () => {
    expect(nextPmDue(day('2026-04-01'), 180, day('2026-10-09'))).toEqual(
      day('2026-09-28'),
    );
  });

  it('counts from registration when no PM is recorded', () => {
    expect(nextPmDue(null, 90, day('2026-10-09'))).toEqual(day('2027-01-07'));
  });

  it('has no schedule without an interval', () => {
    expect(nextPmDue(day('2026-04-01'), null, day('2026-10-09'))).toBeNull();
    expect(nextPmDue(undefined, 0, day('2026-10-09'))).toBeNull();
  });
});
