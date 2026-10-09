import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { weekStart } from '../src/dashboard/dashboard.service';
import {
  asset,
  assetId,
  buildStore,
  DAY,
  type DeviceStore,
  FAC_2,
} from './device-store';
import { bearer, createTestApp, ORG_B } from './helpers';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY);
  const ahead = (days: number) => new Date(now + days * DAY);

  beforeEach(async () => {
    store = buildStore();
    store.assets.push(
      asset(1, { nextPmDueDate: ahead(60) }),
      asset(2, { assetStatus: 'IN_SERVICE', nextPmDueDate: ahead(10) }),
      asset(3, {
        assetStatus: 'QUARANTINED',
        criticalityLevel: 'CRITICAL',
        nextPmDueDate: ago(20),
      }),
      asset(4, { assetStatus: 'IN_MAINTENANCE', nextPmDueDate: ago(3) }),
      asset(5, { nextPmDueDate: null }), // no PM schedule
      asset(6, { assetStatus: 'RETIRED', nextPmDueDate: ago(100) }), // history
      asset(7, { deletedAt: new Date(), nextPmDueDate: ago(5) }), // deleted
      asset(8, { organizationId: ORG_B, nextPmDueDate: ago(5) }), // other org
      asset(9, { currentFacilityId: FAC_2, nextPmDueDate: ago(1) }),
    );
    store.statusChanges.push({
      assetId: assetId(3),
      changedAt: ago(2),
      toStatus: 'QUARANTINED',
    });
    store.orders.push(
      // An urgent repair, reported 5 days ago, not yet taken on.
      {
        id: 'wo-urgent',
        assetId: assetId(3),
        workOrderType: 'CORRECTIVE_MAINTENANCE',
        workOrderStatus: 'PENDING',
        isEmergency: true,
        assignedTechnicianId: null,
        createdAt: ago(5),
        completedAt: null,
      },
      // The overdue device 4 already has its PM work order open.
      {
        id: 'wo-pm-4',
        assetId: assetId(4),
        workOrderType: 'PREVENTIVE_MAINTENANCE',
        workOrderStatus: 'AWAITING_PARTS',
        isEmergency: false,
        assignedTechnicianId: 'user-technician',
        createdAt: ago(1),
        completedAt: null,
      },
      // Repairs finished in the window: 4 h and 10 h.
      {
        id: 'wo-done-1',
        assetId: assetId(1),
        workOrderType: 'CORRECTIVE_MAINTENANCE',
        workOrderStatus: 'COMPLETED',
        createdAt: new Date(now - 10 * 3.6e6),
        completedAt: new Date(now - 6 * 3.6e6),
      },
      {
        id: 'wo-done-2',
        assetId: assetId(2),
        workOrderType: 'CORRECTIVE_MAINTENANCE',
        workOrderStatus: 'COMPLETED',
        createdAt: ago(30),
        completedAt: new Date(ago(30).getTime() + 10 * 3.6e6),
      },
      // Too old for time to repair.
      {
        id: 'wo-old',
        assetId: assetId(2),
        workOrderType: 'CORRECTIVE_MAINTENANCE',
        workOrderStatus: 'COMPLETED',
        createdAt: ago(200),
        completedAt: ago(199),
      },
      // Another organization's open work.
      {
        id: 'wo-b',
        assetId: assetId(8),
        workOrderType: 'CORRECTIVE_MAINTENANCE',
        workOrderStatus: 'PENDING',
        isEmergency: true,
        createdAt: ago(1),
      },
    );
    app = await createTestApp(store);
  });
  afterEach(async () => {
    await app.close();
  });

  const get = (query = '', role: Parameters<typeof bearer>[0] = 'engineer') =>
    request(app.getHttpServer())
      .get(`/api/dashboard${query}`)
      .set(bearer(role));

  it('counts devices in use and out of use, leaving out retired, deleted and other hospitals’ devices', async () => {
    const { body } = await get().expect(200);
    expect(body.devices).toMatchObject({
      total: 6, // 1–5 and 9
      inUse: 4,
      outOfUse: 2,
      byStatus: {
        ACTIVE: 3,
        IN_SERVICE: 1,
        QUARANTINED: 1,
        IN_MAINTENANCE: 1,
        RETIRED: 1,
        DISPOSED: 0,
      },
    });
    // Highest risk first, with when it went out of use.
    expect(body.devices.outOfUseList).toEqual([
      expect.objectContaining({
        id: assetId(3),
        assetStatus: 'QUARANTINED',
        location: 'ICU, City General',
        since: ago(2).toISOString(),
      }),
      expect.objectContaining({ id: assetId(4), since: null }),
    ]);
  });

  it('shows PM overdue, due soon and compliance, and whether overdue PM is already in hand', async () => {
    const { body } = await get().expect(200);
    expect(body.pm).toMatchObject({
      scheduled: 5, // 1, 2, 3, 4, 9
      overdue: 3, // 3, 4, 9
      dueSoon: 1, // 2 (10 days); 1 is 60 days away
      dueSoonDays: 30,
      notScheduled: 1,
      compliancePercent: 40,
    });
    expect(
      body.pm.overdueList.map(
        (d: { id: string; daysOverdue: number; openWorkOrder: unknown }) => [
          d.id,
          d.daysOverdue,
          d.openWorkOrder,
        ],
      ),
    ).toEqual([
      [assetId(3), 20, null],
      [assetId(4), 3, { id: 'wo-pm-4', workOrderStatus: 'AWAITING_PARTS' }],
      [assetId(9), 1, null],
    ]);
  });

  it('summarises open work and how long repairs take', async () => {
    const { body } = await get().expect(200);
    expect(body.workOrders).toMatchObject({
      open: 2,
      urgent: 1,
      unassigned: 1,
      awaitingParts: 1,
    });
    expect(body.repairs).toEqual({
      windowDays: 90,
      completed: 2,
      meanHours: 7,
      medianHours: 7,
    });

    const weeks = body.workOrders.weekly as Array<{
      weekStart: string;
      opened: number;
      completed: number;
    }>;
    expect(weeks).toHaveLength(8);
    expect(weeks[7].weekStart).toBe(weekStart(new Date(now)).toISOString());
    const total = (k: 'opened' | 'completed') =>
      weeks.reduce((s, w) => s + w[k], 0);
    // In the last 8 weeks: opened urgent, PM, done-1, done-2; completed done-1, done-2.
    expect(total('opened')).toBe(4);
    expect(total('completed')).toBe(2);
  });

  it('narrows everything to one facility', async () => {
    const { body } = await get(`?facilityId=${FAC_2}`).expect(200);
    expect(body.devices.total).toBe(1);
    expect(body.pm).toMatchObject({ scheduled: 1, overdue: 1 });
    expect(body.workOrders.open).toBe(0);
    await get('?facilityId=not-a-uuid').expect(400);
  });

  it('is for signed-in staff only', async () => {
    await get('', 'clinical_staff').expect(200);
    await get('', 'viewer').expect(200);
    await get('', 'integration').expect(403);
    await request(app.getHttpServer()).get('/api/dashboard').expect(401);
  });

  it('reports no compliance figure when nothing is scheduled', async () => {
    store.assets.forEach((a) => (a.nextPmDueDate = null));
    const { body } = await get().expect(200);
    expect(body.pm.compliancePercent).toBeNull();
    expect(body.pm.notScheduled).toBe(6);
  });
});

describe('weekStart', () => {
  it('is the Monday of the week, in UTC', () => {
    expect(weekStart(new Date('2026-10-09T12:00:00Z')).toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
    expect(weekStart(new Date('2026-10-05T00:00:00Z')).toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
    expect(weekStart(new Date('2026-10-04T23:59:00Z')).toISOString()).toBe(
      '2026-09-28T00:00:00.000Z',
    );
  });
});
