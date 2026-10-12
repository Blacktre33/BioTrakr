import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { DowntimeService } from '../src/downtime/downtime.service';
import { asset, assetId, buildStore, type DeviceStore } from './device-store';
import { bearer, createTestApp } from './helpers';

const HOUR = 3.6e6;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);
const orderId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('Downtime and uptime (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const http = () => request(app.getHttpServer());

  /** A problem reported `hours` ago on device n. */
  const breakdown = (
    n: number,
    hours: number,
    over: Record<string, unknown> = {},
  ) => {
    const row: Record<string, unknown> = {
      id: orderId(100 + n),
      assetId: assetId(n),
      workOrderType: 'CORRECTIVE_MAINTENANCE',
      workOrderStatus: 'PENDING',
      createdAt: ago(hours),
      scheduledDate: ago(hours),
      startedAt: null,
      completedAt: null,
      isEmergency: false,
      assignedTechnicianId: null,
      createdByUserId: 'user-clinical_staff',
      description: 'Alarm keeps sounding',
      ...over,
    };
    store.orders.push(row);
    return row;
  };

  beforeEach(async () => {
    store = buildStore();
    store.assets.push(
      // Critical: 72 hours to put right.
      asset(1, {
        equipmentName: 'Ventilator',
        criticalityLevel: 'CRITICAL',
        deviceCategory: 'LIFE_SUPPORT',
        createdAt: ago(1000),
      }),
      // Everything else: 7 days.
      asset(2, {
        equipmentName: 'Suction pump',
        criticalityLevel: 'MEDIUM',
        deviceCategory: 'THERAPEUTIC',
        createdAt: ago(1000),
      }),
    );
    app = await createTestApp(store);
  });
  afterEach(async () => {
    await app.close();
  });

  it('runs a clock on every breakdown in the work queue, against its limit', async () => {
    breakdown(1, 60);
    breakdown(2, 60);
    const res = await http()
      .get('/api/work-orders')
      .set(bearer('technician'))
      .expect(200);
    const clock = (n: number) =>
      res.body.items.find(
        (o: { asset: { id: string } }) => o.asset.id === assetId(n),
      ).downtime;
    expect(clock(1)).toMatchObject({
      open: true,
      hours: 60,
      limitHours: 72,
      leftHours: 12,
      state: 'nearing',
    });
    expect(clock(2)).toMatchObject({ limitHours: 168, state: 'within' });
  });

  it('keeps the downtime with the record when the repair is completed', async () => {
    const wo = breakdown(1, 6.5, {
      workOrderStatus: 'IN_PROGRESS',
      startedAt: ago(5),
    });
    const res = await http()
      .patch(`/api/work-orders/${wo.id}`)
      .set(bearer('technician'))
      .send({
        expectedStatus: 'IN_PROGRESS',
        status: 'COMPLETED',
        workPerformed: 'Replaced the flow sensor',
      })
      .expect(200);
    expect(wo.downtimeHours as number).toBeCloseTo(6.5, 1);
    expect(res.body.downtime).toMatchObject({
      open: false,
      attendHours: 1.5,
      state: 'within',
    });
  });

  it('warns biomed near the limit and again, urgently, once it has passed', async () => {
    breakdown(1, 60);
    breakdown(2, 200);
    const downtime = app.get(DowntimeService);
    await downtime.checkLimits();
    await downtime.checkLimits();
    const notices = store.notifications.filter(
      (n) => n.kind === 'downtime_limit',
    );
    // Each warning once, to biomed at the device's facility.
    const titles = [
      ...new Set(notices.map((n) => `${n.severity}: ${n.title}`)),
    ];
    expect(titles.sort()).toEqual([
      'critical: Repair limit passed: Suction pump (TAG-2)',
      'warning: Repair limit near: Ventilator (TAG-1)',
    ]);
    expect(
      notices
        .filter((n) => n.title.startsWith('Repair limit near'))
        .map((n) => n.userId)
        .sort(),
    ).toEqual(['user-admin', 'user-technician']);
    expect(notices.find((n) => n.severity === 'critical')?.body).toMatch(
      /^Reported 8 days 8 h ago; this equipment should be back within 7 days\.\nOver by 32 h\./,
    );
  });

  it('shows uptime, the census and open breakdowns on the dashboard', async () => {
    // The ventilator was out of use for 72 of the last 720 hours.
    store.statusChanges.push(
      {
        assetId: assetId(1),
        changedAt: ago(200),
        fromStatus: 'ACTIVE',
        toStatus: 'QUARANTINED',
      },
      {
        assetId: assetId(1),
        changedAt: ago(128),
        fromStatus: 'QUARANTINED',
        toStatus: 'ACTIVE',
      },
    );
    breakdown(1, 200, {
      workOrderStatus: 'COMPLETED',
      startedAt: ago(190),
      completedAt: ago(128),
    });
    breakdown(2, 80);
    const res = await http()
      .get('/api/dashboard')
      .set(bearer('engineer'))
      .expect(200);
    expect(res.body.uptime).toMatchObject({
      windowDays: 30,
      // 72 hours down of 1,440 device-hours.
      percent: 95,
      censusPercent: 100,
      targetPercent: 95,
      breakdowns: 2,
      meanAttendHours: 10,
      open: {
        total: 1,
        nearing: 0,
        over: 0,
        ageing: {
          underOneDay: 0,
          oneToThreeDays: 0,
          threeToSevenDays: 1,
          overSevenDays: 0,
        },
      },
    });
  });

  it('prints an uptime register, worst first, and the limits on the breakdown register', async () => {
    store.statusChanges.push({
      assetId: assetId(2),
      changedAt: ago(100),
      fromStatus: 'ACTIVE',
      toStatus: 'IN_MAINTENANCE',
    });
    breakdown(2, 100);
    const uptime = await http()
      .get('/api/registers/uptime')
      .set(bearer('viewer'))
      .expect(200);
    expect(uptime.body.rows.map((r: { device: string }) => r.device)).toEqual([
      'TAG-2 · Suction pump',
      'TAG-1 · Ventilator',
    ]);
    expect(uptime.body.rows[1]).toMatchObject({
      uptime: '100%',
      limit: '72 h',
    });
    expect(uptime.body.notes[0]).toMatch(/against a target of 95%/);

    const breakdowns = await http()
      .get('/api/registers/breakdown')
      .set(bearer('viewer'))
      .expect(200);
    expect(breakdowns.body.rows[0]).toMatchObject({
      limit: '7 days',
      within: 'Open, 2 days 20 h left',
    });
  });
});
