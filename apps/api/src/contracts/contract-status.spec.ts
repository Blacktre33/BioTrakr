import {
  contractStatus,
  CONTRACT_NOTICE_DAYS,
  daysUntil,
  describeEnd,
  noticeThreshold,
  WARRANTY_NOTICE_DAYS,
} from './contract-status';

const at = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m - 1, d, h);

describe('daysUntil', () => {
  const now = at(2026, 10, 11, 9);

  it('counts calendar days, whatever the time of day', () => {
    expect(daysUntil(at(2026, 10, 11, 23), now)).toBe(0);
    expect(daysUntil(at(2026, 10, 12, 0), now)).toBe(1);
    expect(daysUntil(at(2027, 1, 9), now)).toBe(90);
    expect(daysUntil(at(2026, 10, 8), now)).toBe(-3);
  });
});

describe('contractStatus', () => {
  const now = at(2026, 10, 11);
  const contract = (start: Date, end: Date, terminatedAt: Date | null = null) =>
    contractStatus({ startDate: start, endDate: end, terminatedAt }, now);

  it('is active from the first day to the end of the last', () => {
    expect(contract(at(2026, 10, 11, 18), at(2027, 10, 10))).toBe('active');
    expect(contract(at(2025, 10, 12), at(2026, 10, 11, 0))).toBe('active');
  });

  it('is upcoming before it starts and expired after its last day', () => {
    expect(contract(at(2026, 10, 12), at(2027, 10, 11))).toBe('upcoming');
    expect(contract(at(2025, 10, 11), at(2026, 10, 10))).toBe('expired');
  });

  it('is terminated once ended early, whatever the dates say', () => {
    expect(contract(at(2026, 4, 1), at(2027, 3, 31), at(2026, 9, 1))).toBe(
      'terminated',
    );
  });
});

describe('noticeThreshold', () => {
  it('names the threshold most recently crossed', () => {
    expect(noticeThreshold(91, CONTRACT_NOTICE_DAYS)).toBeNull();
    expect(noticeThreshold(90, CONTRACT_NOTICE_DAYS)).toBe(90);
    expect(noticeThreshold(61, CONTRACT_NOTICE_DAYS)).toBe(90);
    expect(noticeThreshold(45, CONTRACT_NOTICE_DAYS)).toBe(60);
    expect(noticeThreshold(12, CONTRACT_NOTICE_DAYS)).toBe(30);
    expect(noticeThreshold(3, CONTRACT_NOTICE_DAYS)).toBe(7);
    expect(noticeThreshold(0, CONTRACT_NOTICE_DAYS)).toBe(0);
    expect(noticeThreshold(45, WARRANTY_NOTICE_DAYS)).toBe(90);
    expect(noticeThreshold(12, WARRANTY_NOTICE_DAYS)).toBe(30);
  });

  it('says nothing about an end long past', () => {
    expect(noticeThreshold(-7, CONTRACT_NOTICE_DAYS)).toBe(0);
    expect(noticeThreshold(-8, CONTRACT_NOTICE_DAYS)).toBeNull();
  });
});

describe('describeEnd', () => {
  it('reads naturally', () => {
    expect(describeEnd(12)).toBe('ends in 12 days');
    expect(describeEnd(1)).toBe('ends tomorrow');
    expect(describeEnd(0)).toBe('ends today');
    expect(describeEnd(-1)).toBe('ended yesterday');
    expect(describeEnd(-3)).toBe('ended 3 days ago');
  });
});
