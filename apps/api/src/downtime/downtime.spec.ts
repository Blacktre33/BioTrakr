import {
  breakdownClock,
  deviceTime,
  repairLimitHours,
  uptimePercent,
} from './downtime';

const H = 3.6e6;
const t0 = new Date('2026-10-01T00:00:00Z');
const at = (hours: number) => new Date(t0.getTime() + hours * H);

const ventilator = {
  criticalityLevel: 'CRITICAL',
  deviceCategory: 'LIFE_SUPPORT',
} as const;
const suctionPump = {
  criticalityLevel: 'MEDIUM',
  deviceCategory: 'THERAPEUTIC',
} as const;

describe('repairLimitHours', () => {
  afterEach(() => {
    delete process.env.DOWNTIME_LIMIT_CRITICAL_HOURS;
  });

  it('gives critical and life-saving equipment 72 hours, everything else 7 days', () => {
    expect(repairLimitHours(ventilator)).toBe(72);
    expect(
      repairLimitHours({
        criticalityLevel: 'LOW',
        deviceCategory: 'LIFE_SUPPORT',
      }),
    ).toBe(72);
    expect(
      repairLimitHours({ criticalityLevel: 'HIGH', deviceCategory: 'IMAGING' }),
    ).toBe(72);
    expect(repairLimitHours(suctionPump)).toBe(168);
  });

  it('can be set for the hospital, within reason', () => {
    process.env.DOWNTIME_LIMIT_CRITICAL_HOURS = '48';
    expect(repairLimitHours(ventilator)).toBe(48);
    process.env.DOWNTIME_LIMIT_CRITICAL_HOURS = 'soon';
    expect(repairLimitHours(ventilator)).toBe(72);
  });
});

describe('breakdownClock', () => {
  const report = (over: Record<string, unknown> = {}) => ({
    workOrderType: 'CORRECTIVE_MAINTENANCE' as const,
    workOrderStatus: 'PENDING' as const,
    createdAt: t0,
    startedAt: null,
    completedAt: null,
    ...over,
  });

  it('runs from the report while the device waits, warning at three quarters of the limit', () => {
    expect(breakdownClock(report(), ventilator, at(10))).toEqual({
      open: true,
      hours: 10,
      attendHours: null,
      limitHours: 72,
      leftHours: 62,
      state: 'within',
    });
    expect(breakdownClock(report(), ventilator, at(54))?.state).toBe('nearing');
    expect(breakdownClock(report(), ventilator, at(80))).toMatchObject({
      state: 'over',
      leftHours: -8,
    });
    expect(breakdownClock(report(), suctionPump, at(80))?.state).toBe('within');
  });

  it('stops when the device is put right, with the time it took to attend', () => {
    const done = report({
      workOrderStatus: 'COMPLETED',
      startedAt: at(1.5),
      completedAt: at(6.5),
    });
    expect(breakdownClock(done, ventilator, at(500))).toMatchObject({
      open: false,
      hours: 6.5,
      attendHours: 1.5,
      state: 'within',
    });
    // Completed without being started: attended when put right.
    expect(
      breakdownClock({ ...done, startedAt: null }, ventilator, at(500))
        ?.attendHours,
    ).toBe(6.5);
  });

  it('has no clock for cancelled reports or other work', () => {
    expect(
      breakdownClock(report({ workOrderStatus: 'CANCELLED' }), ventilator),
    ).toBeNull();
    expect(
      breakdownClock(
        report({ workOrderType: 'PREVENTIVE_MAINTENANCE' }),
        ventilator,
      ),
    ).toBeNull();
  });
});

describe('deviceTime', () => {
  const device = { createdAt: at(-1000), assetStatus: 'ACTIVE' as const };
  const change = (h: number, fromStatus: string, toStatus: string) => ({
    changedAt: at(h),
    fromStatus: fromStatus as never,
    toStatus: toStatus as never,
  });

  it('counts the hours out of use within the period', () => {
    // Quarantined at 10 h, repaired from 12 h, back in use at 30 h.
    const time = deviceTime(
      device,
      [
        change(10, 'ACTIVE', 'QUARANTINED'),
        change(12, 'QUARANTINED', 'IN_MAINTENANCE'),
        change(30, 'IN_MAINTENANCE', 'ACTIVE'),
      ],
      t0,
      at(100),
    );
    expect(time).toEqual({ serviceHours: 100, downHours: 20 });
    expect(uptimePercent(time)).toBe(80);
  });

  it('takes the status at the start of the period from the changes around it', () => {
    // Out of use since before the period, back in use at 40 h.
    expect(
      deviceTime(
        device,
        [
          change(-50, 'ACTIVE', 'QUARANTINED'),
          change(40, 'QUARANTINED', 'ACTIVE'),
        ],
        t0,
        at(100),
      ),
    ).toEqual({ serviceHours: 100, downHours: 40 });
    // No change before the period: the first one says what it was.
    expect(
      deviceTime(
        { ...device, assetStatus: 'ACTIVE' },
        [change(40, 'QUARANTINED', 'ACTIVE')],
        t0,
        at(100),
      ),
    ).toEqual({ serviceHours: 100, downHours: 40 });
    // No changes at all: the status now held throughout.
    expect(
      deviceTime({ ...device, assetStatus: 'IN_MAINTENANCE' }, [], t0, at(10)),
    ).toEqual({ serviceHours: 10, downHours: 10 });
  });

  it('counts only time in service: not before it was registered, nor once condemned', () => {
    expect(
      deviceTime(
        { createdAt: at(50), assetStatus: 'CONDEMNED' },
        [change(80, 'ACTIVE', 'CONDEMNED')],
        t0,
        at(100),
      ),
    ).toEqual({ serviceHours: 30, downHours: 0 });
    expect(
      deviceTime(
        { createdAt: at(200), assetStatus: 'ACTIVE' },
        [],
        t0,
        at(100),
      ),
    ).toEqual({ serviceHours: 0, downHours: 0 });
    expect(uptimePercent({ serviceHours: 0, downHours: 0 })).toBeNull();
  });
});
