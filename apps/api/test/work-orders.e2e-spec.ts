import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { bearer, createTestApp, ORG_A } from './helpers';

const VENT = '11111111-1111-4111-8111-111111111111';
const PUMP = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';

type Rec = Record<string, unknown>;

/** Work order ids are UUIDs (the route validates them). */
const woId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WO1 = woId(1);
const WO_PM = woId(99);
const ENGINEER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_NURSE =
  'nnnnnnnn'.replace(/n/g, 'a') + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** In-memory Prisma: enough of asset, work orders, users and status history. */
function buildPrisma() {
  const assets: Rec[] = [
    {
      id: VENT,
      organizationId: ORG_A,
      deletedAt: null,
      assetTagNumber: 'VENT-7',
      equipmentName: 'ICU ventilator',
      assetStatus: 'ACTIVE',
      criticalityLevel: 'CRITICAL',
      pmFrequencyDays: 30,
      lastPmDate: null,
    },
    {
      id: PUMP,
      organizationId: ORG_A,
      deletedAt: null,
      assetTagNumber: 'PUMP-1',
      equipmentName: 'Infusion pump',
      assetStatus: 'ACTIVE',
      criticalityLevel: 'MEDIUM',
      pmFrequencyDays: null,
      lastPmDate: null,
    },
    {
      id: FOREIGN,
      organizationId: 'org-b',
      deletedAt: null,
      assetTagNumber: 'X',
      equipmentName: 'X',
      assetStatus: 'ACTIVE',
      criticalityLevel: 'LOW',
    },
  ];
  const users: Rec[] = [
    {
      id: 'user-clinical_staff',
      organizationId: ORG_A,
      firstName: 'Nia',
      lastName: 'Nurse',
      role: 'clinical_staff',
      isActive: true,
    },
    {
      id: 'user-technician',
      organizationId: ORG_A,
      firstName: 'Tara',
      lastName: 'Tech',
      role: 'technician',
      isActive: true,
    },
    {
      id: OTHER_NURSE,
      organizationId: ORG_A,
      firstName: 'Ola',
      lastName: 'Other',
      role: 'clinical_staff',
      isActive: true,
    },
    {
      id: ENGINEER,
      organizationId: ORG_A,
      firstName: 'Eli',
      lastName: 'Eng',
      role: 'ENGINEER',
      isActive: true,
    },
  ];
  const orders: Rec[] = [];
  const statusChanges: Rec[] = [];

  const scalar = (v: unknown) =>
    v === null || typeof v !== 'object' || v instanceof Date;
  const matches = (row: Rec, where: Rec = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v === undefined) return true;
      if (k === 'asset')
        return matches(assets.find((a) => a.id === row.assetId)!, v as Rec);
      if (scalar(v)) return v === null ? row[k] == null : row[k] === v;
      const cond = v as { in?: unknown[]; lt?: Date };
      if (cond.in) return cond.in.includes(row[k]);
      return true;
    });
  const user = (id: unknown) => {
    const u = users.find((x) => x.id === id);
    return u
      ? { id: u.id, firstName: u.firstName, lastName: u.lastName }
      : null;
  };
  const view = (o: Rec) => {
    const a = assets.find((x) => x.id === o.assetId)!;
    return {
      ...o,
      asset: {
        ...a,
        currentFacility: { facilityName: 'City General' },
        currentRoom: null,
        custodianDepartment: { departmentName: 'ICU' },
      },
      createdBy: user(o.createdByUserId),
      assignedTechnician: user(o.assignedTechnicianId),
    };
  };

  const mock = {
    assets,
    orders,
    statusChanges,
    asset: {
      findFirst: jest.fn(
        async ({ where }) => assets.find((a) => matches(a, where)) ?? null,
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = assets.filter((a) => matches(a, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
    },
    maintenanceHistory: {
      create: jest.fn(async ({ data }) => {
        const row = {
          id: woId(orders.length + 1),
          startedAt: null,
          completedAt: null,
          workPerformed: null,
          failureCategory: null,
          assignedTechnicianId: null,
          createdAt: new Date(),
          ...data,
        };
        orders.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }) => {
        const o = orders.find((r) => matches(r, where));
        return o ? view(o) : null;
      }),
      findMany: jest.fn(async ({ where }) =>
        orders
          .filter((r) => matches(r, where))
          .sort((a, b) => Number(b.isEmergency) - Number(a.isEmergency))
          .map(view),
      ),
      count: jest.fn(
        async ({ where }) => orders.filter((r) => matches(r, where)).length,
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = orders.filter((r) => matches(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
    },
    user: {
      findFirst: jest.fn(
        async ({ where }) => users.find((u) => matches(u, where)) ?? null,
      ),
      findMany: jest.fn(async ({ where }) =>
        users.filter((u) => matches(u, where)),
      ),
    },
    assetStatusChange: {
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `sc-${statusChanges.length + 1}`,
          changedAt: new Date(),
          ...data,
        };
        statusChanges.push(row);
        return row;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mock),
    ),
  };
  return mock;
}

describe('Problem reports and work orders (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    app = await createTestApp(prisma);
  });
  afterEach(async () => {
    await app.close();
  });

  const report = (
    body: object,
    role: Parameters<typeof bearer>[0] = 'clinical_staff',
  ) =>
    request(app.getHttpServer())
      .post('/api/work-orders/problem-reports')
      .set(bearer(role))
      .send(body);
  const update = (
    id: string,
    body: object,
    role: Parameters<typeof bearer>[0] = 'technician',
  ) =>
    request(app.getHttpServer())
      .patch(`/api/work-orders/${id}`)
      .set(bearer(role))
      .send(body);

  it('lets a nurse report a problem and take the device out of use in one step', async () => {
    const { body } = await report({
      assetId: VENT,
      description: 'Low-pressure alarm keeps sounding',
      takeOutOfUse: true,
      locationHint: 'ICU bay 3',
    }).expect(201);

    expect(body).toEqual({
      workOrderId: WO1,
      takenOutOfUse: true,
      outOfUse: true,
    });
    expect(prisma.orders[0]).toMatchObject({
      workOrderType: 'CORRECTIVE_MAINTENANCE',
      workOrderStatus: 'PENDING',
      isEmergency: true, // critical device taken out of use
      createdByUserId: 'user-clinical_staff',
      description: 'Low-pressure alarm keeps sounding\n\nWhere: ICU bay 3',
    });
    expect(prisma.assets[0].assetStatus).toBe('QUARANTINED');
    expect(prisma.statusChanges).toEqual([
      expect.objectContaining({
        source: 'FAULT_REPORT',
        workOrderId: WO1,
        changedById: 'user-clinical_staff',
        toStatus: 'QUARANTINED',
      }),
    ]);
  });

  it('can report a minor problem without taking the device out of use', async () => {
    const { body } = await report({
      assetId: PUMP,
      description: 'Label is peeling off',
      takeOutOfUse: false,
    }).expect(201);
    expect(body.takenOutOfUse).toBe(false);
    expect(prisma.assets[1].assetStatus).toBe('ACTIVE');
    expect(prisma.orders[0].isEmergency).toBe(false);
  });

  it('keeps reports inside the organization and to the right people', async () => {
    await report({
      assetId: FOREIGN,
      description: 'Broken screen',
      takeOutOfUse: true,
    }).expect(404);
    await report(
      { assetId: PUMP, description: 'Broken screen', takeOutOfUse: true },
      'viewer',
    ).expect(403);
    await request(app.getHttpServer())
      .get('/api/work-orders')
      .set(bearer('clinical_staff'))
      .expect(403);
    expect(prisma.assets[2].assetStatus).toBe('ACTIVE');
  });

  it('shows biomed the queue with emergencies first', async () => {
    await report({
      assetId: PUMP,
      description: 'Label is peeling off',
      takeOutOfUse: false,
    });
    await report({
      assetId: VENT,
      description: 'Alarm keeps sounding',
      takeOutOfUse: true,
    });

    const { body } = await request(app.getHttpServer())
      .get('/api/work-orders?view=open')
      .set(bearer('technician'))
      .expect(200);
    expect(body.total).toBe(2);
    expect(body.items[0]).toMatchObject({
      isEmergency: true,
      reportedBy: 'Nia Nurse',
      asset: {
        assetTagNumber: 'VENT-7',
        assetStatus: 'QUARANTINED',
        location: 'ICU, City General',
      },
    });
  });

  it('assigns only to biomed staff, and refuses stale updates', async () => {
    await report({
      assetId: VENT,
      description: 'Alarm keeps sounding',
      takeOutOfUse: true,
    });

    await update(WO1, {
      expectedStatus: 'PENDING',
      assignedTechnicianId: OTHER_NURSE,
    }).expect(400);
    const { body } = await update(WO1, {
      expectedStatus: 'PENDING',
      assignedTechnicianId: ENGINEER,
    }).expect(200);
    expect(body).toMatchObject({
      workOrderStatus: 'ASSIGNED',
      assignedTo: { name: 'Eli Eng' },
    });

    // Someone saw it as PENDING and tries to act on it: refused.
    await update(WO1, {
      expectedStatus: 'PENDING',
      status: 'IN_PROGRESS',
    }).expect(409);
  });

  it('completes the work and releases the device only with a safety confirmation', async () => {
    await report({
      assetId: VENT,
      description: 'Alarm keeps sounding',
      takeOutOfUse: true,
    });
    await update(WO1, {
      expectedStatus: 'PENDING',
      status: 'IN_PROGRESS',
    }).expect(200);
    expect(prisma.orders[0].startedAt).toBeInstanceOf(Date);

    await update(WO1, {
      expectedStatus: 'IN_PROGRESS',
      status: 'COMPLETED',
    }).expect(400); // no note
    await update(WO1, {
      expectedStatus: 'IN_PROGRESS',
      status: 'COMPLETED',
      workPerformed: 'Replaced pressure sensor; tested',
      releaseDevice: true,
    }).expect(400); // no confirmation
    expect(prisma.orders[0].workOrderStatus).toBe('IN_PROGRESS');
    expect(prisma.assets[0].assetStatus).toBe('QUARANTINED');

    const { body } = await update(WO1, {
      expectedStatus: 'IN_PROGRESS',
      status: 'COMPLETED',
      workPerformed: 'Replaced pressure sensor; tested',
      failureCategory: 'SENSOR',
      releaseDevice: true,
      confirmSafe: true,
    }).expect(200);

    expect(body).toMatchObject({
      workOrderStatus: 'COMPLETED',
      deviceReleased: true,
      assignedTo: { name: 'Tara Tech' },
    });
    expect(prisma.assets[0].assetStatus).toBe('ACTIVE');
    expect(prisma.statusChanges[1]).toMatchObject({
      fromStatus: 'QUARANTINED',
      toStatus: 'ACTIVE',
      source: 'WORK_ORDER',
      workOrderId: WO1,
      reason: 'Work order completed: Replaced pressure sensor; tested',
    });

    // Closed is closed.
    await update(WO1, {
      expectedStatus: 'COMPLETED',
      status: 'IN_PROGRESS',
    }).expect(400);
  });

  it('sets the PM dates when a preventive maintenance work order is completed', async () => {
    prisma.orders.push({
      id: WO_PM,
      assetId: VENT,
      workOrderType: 'PREVENTIVE_MAINTENANCE',
      workOrderStatus: 'ASSIGNED',
      scheduledDate: new Date(),
      isEmergency: false,
      createdByUserId: ENGINEER,
      assignedTechnicianId: 'user-technician',
      startedAt: null,
    });
    await update(WO_PM, {
      expectedStatus: 'ASSIGNED',
      status: 'COMPLETED',
      workPerformed: 'Annual PM per checklist',
    }).expect(200);

    const vent = prisma.assets[0];
    expect(vent.lastPmDate).toBeInstanceOf(Date);
    expect(
      (vent.nextPmDueDate as Date).getTime() -
        (vent.lastPmDate as Date).getTime(),
    ).toBe(30 * 24 * 3600 * 1000);
  });
});
