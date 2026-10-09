import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  NotificationJobsService,
  signWebhook,
} from '../src/notifications/notification-jobs.service';
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
      currentFacilityId: 'fac-1',
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
      currentFacilityId: 'fac-1',
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
    {
      id: 'user-tech-north',
      organizationId: ORG_A,
      firstName: 'Noor',
      lastName: 'North',
      role: 'technician',
      isActive: true,
      facilityId: 'fac-2', // another hospital in the group
    },
  ];
  const notifications: Rec[] = [];
  const outbound: Rec[] = [];
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
      if (k === 'AND') return (v as Rec[]).every((w) => matches(row, w));
      if (k === 'OR') return (v as Rec[]).some((w) => matches(row, w));
      const cond = v as {
        in?: unknown[];
        lt?: Date;
        lte?: Date;
        gte?: Date;
        not?: unknown;
        equals?: string;
      };
      if (cond.in) return cond.in.includes(row[k]);
      if ('not' in cond) return row[k] !== cond.not;
      if (cond.equals !== undefined)
        return String(row[k]).toLowerCase() === cond.equals.toLowerCase();
      if (
        cond.lt !== undefined &&
        !(row[k] != null && (row[k] as Date) < cond.lt)
      )
        return false;
      if (cond.lte && !((row[k] as Date) <= cond.lte)) return false;
      if (cond.gte && !((row[k] as Date) >= cond.gte)) return false;
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
    users,
    notifications,
    outbound,
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
        users.filter((u) => matches({ facilityId: null, ...u }, where)),
      ),
      findUnique: jest.fn(
        async ({ where }) => users.find((u) => u.id === where.id) ?? null,
      ),
    },
    notification: {
      createMany: jest.fn(async ({ data }) => {
        for (const row of data as Rec[]) {
          const dup =
            row.dedupeKey &&
            notifications.some(
              (n) => n.userId === row.userId && n.dedupeKey === row.dedupeKey,
            );
          if (!dup)
            notifications.push({ id: `n${notifications.length + 1}`, ...row });
        }
        return { count: data.length };
      }),
      count: jest.fn(
        async ({ where }) =>
          notifications.filter((n) => matches(n, where)).length,
      ),
      deleteMany: jest.fn(async ({ where }) => {
        const keep = notifications.filter((n) => !matches(n, where));
        const count = notifications.length - keep.length;
        notifications.splice(0, notifications.length, ...keep);
        return { count };
      }),
    },
    outboundMessage: {
      createMany: jest.fn(async ({ data }) => {
        for (const row of data as Rec[]) {
          if (!outbound.some((o) => o.dedupeKey === row.dedupeKey)) {
            outbound.push({
              id: `ob${outbound.length + 1}`,
              attempts: 0,
              nextAttemptAt: new Date(0),
              sentAt: null,
              failedAt: null,
              ...row,
            });
          }
        }
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where }) =>
        outbound.filter((o) => matches(o, where)).map((o) => ({ ...o })),
      ),
      findUnique: jest.fn(
        async ({ where }) => outbound.find((o) => o.id === where.id) ?? null,
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = outbound.filter(
          (o) =>
            matches(o, {
              ...where,
              nextAttemptAt: undefined,
            }) &&
            (o.nextAttemptAt as Date).getTime() ===
              (where.nextAttemptAt as Date).getTime(),
        );
        for (const r of rows) {
          for (const [k, v] of Object.entries(data as Rec)) {
            const inc = (v as { increment?: number } | null)?.increment;
            r[k] = inc !== undefined ? (r[k] as number) + inc : v;
          }
        }
        return { count: rows.length };
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const keep = outbound.filter((o) => !matches(o, where));
        const count = outbound.length - keep.length;
        outbound.splice(0, outbound.length, ...keep);
        return { count };
      }),
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
    // Savepoints around notices (see bestEffort).
    $executeRawUnsafe: jest.fn(async () => 0),
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

    // Biomed at this hospital hears at once; ward staff and other sites don't.
    expect(prisma.notifications.map((n) => n.userId).sort()).toEqual(
      [ENGINEER, 'user-technician'].sort(),
    );
    expect(prisma.notifications[0]).toMatchObject({
      kind: 'problem_reported',
      severity: 'critical',
      title: 'Urgent: ICU ventilator (VENT-7) reported faulty',
      body: 'Low-pressure alarm keeps sounding\nWhere: ICU bay 3\nReported by Nia Nurse · taken out of use',
      workOrderId: WO1,
    });
    // No webhook configured: nothing queued to go out.
    expect(prisma.outbound).toEqual([]);
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
    expect(prisma.notifications[0]).toMatchObject({ severity: 'info' });
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
    expect(prisma.notifications.at(-1)).toMatchObject({
      userId: ENGINEER,
      kind: 'assigned',
      severity: 'critical',
      title: 'Assigned to you: ICU ventilator (VENT-7)',
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
    // The nurse who reported it hears it is fixed.
    expect(prisma.notifications.at(-1)).toMatchObject({
      userId: 'user-clinical_staff',
      kind: 'resolved',
      title: 'Back in service: ICU ventilator (VENT-7)',
      body: 'Replaced pressure sensor; tested',
    });
    expect(prisma.statusChanges[1]).toMatchObject({
      fromStatus: 'QUARANTINED',
      toStatus: 'ACTIVE',
      source: 'WORK_ORDER',
      workOrderId: WO1,
      reason: 'Work order completed: Replaced pressure sensor; tested',
    });

    // Closed is closed: no reopening, and the record of what was done is kept.
    await update(WO1, {
      expectedStatus: 'COMPLETED',
      status: 'IN_PROGRESS',
    }).expect(400);
    await update(WO1, {
      expectedStatus: 'COMPLETED',
      workPerformed: 'Rewritten history',
    }).expect(400);
    expect(prisma.orders[0].workPerformed).toBe(
      'Replaced pressure sensor; tested',
    );
  });

  it('does not release a device while another reported problem is still open', async () => {
    await report({
      assetId: VENT,
      description: 'Alarm keeps sounding',
      takeOutOfUse: true,
    });
    await report({
      assetId: VENT,
      description: 'Screen flickers too',
      takeOutOfUse: true,
    });
    expect(prisma.orders[1].workOrderStatus).toBe('PENDING');

    const res = await update(WO1, {
      expectedStatus: 'PENDING',
      status: 'COMPLETED',
      workPerformed: 'Replaced pressure sensor; tested',
      releaseDevice: true,
      confirmSafe: true,
    }).expect(400);
    expect(res.body.message).toMatch(/Another work order is still open/);
    expect(prisma.orders[0].workOrderStatus).toBe('PENDING');
    expect(prisma.assets[0].assetStatus).toBe('QUARANTINED');
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

  describe('escalation and outbound messages', () => {
    const MIN = 60_000;
    let jobs: NotificationJobsService;
    const env = { ...process.env };
    beforeEach(() => {
      jobs = app.get(NotificationJobsService);
    });
    afterEach(() => {
      process.env = { ...env };
      jest.restoreAllMocks();
    });

    it('escalates an urgent report nobody has taken on, once per level', async () => {
      await report({
        assetId: VENT,
        description: 'Alarm keeps sounding',
        takeOutOfUse: true,
      });
      const t0 = (prisma.orders[0].createdAt as Date).getTime();
      const escalations = () =>
        prisma.notifications.filter((n) => n.kind === 'escalation');

      expect(await jobs.escalate(new Date(t0 + 10 * MIN))).toBe(0);
      expect(await jobs.escalate(new Date(t0 + 16 * MIN))).toBe(1);
      // To the engineer (supervisor), not the technicians again.
      expect(escalations().map((n) => n.userId)).toEqual([ENGINEER]);
      expect(escalations()[0].title).toBe(
        'Nobody has taken this on for 15 min: ICU ventilator (VENT-7)',
      );
      expect(await jobs.escalate(new Date(t0 + 20 * MIN))).toBe(0);
      expect(await jobs.escalate(new Date(t0 + 61 * MIN))).toBe(1);
      expect(escalations()).toHaveLength(2);
    });

    it('does not escalate once someone takes it on, or minor reports', async () => {
      await report({
        assetId: VENT,
        description: 'Alarm keeps sounding',
        takeOutOfUse: true,
      });
      await report({
        assetId: PUMP,
        description: 'Label peeling',
        takeOutOfUse: false,
      });
      await update(WO1, {
        expectedStatus: 'PENDING',
        assignedTechnicianId: ENGINEER,
      }).expect(200);
      const t0 = Date.now();
      expect(await jobs.escalate(new Date(t0 + 90 * MIN))).toBe(0);
    });

    it('after downtime sends only the latest level', async () => {
      await report({
        assetId: VENT,
        description: 'Alarm keeps sounding',
        takeOutOfUse: true,
      });
      const t0 = (prisma.orders[0].createdAt as Date).getTime();
      expect(await jobs.escalate(new Date(t0 + 120 * MIN))).toBe(1);
      expect(await jobs.escalate(new Date(t0 + 121 * MIN))).toBe(0);
      expect(
        prisma.notifications.filter((n) => n.kind === 'escalation')[0]
          .dedupeKey,
      ).toBe(`escalation:60:${WO1}`);
    });

    it('sends urgent notices to a signed webhook, retrying until it answers', async () => {
      process.env.NOTIFY_WEBHOOK_URL =
        'https://gateway.hospital.example/biotrakr';
      process.env.NOTIFY_WEBHOOK_SECRET = 'a-long-shared-secret-for-tests';
      process.env.APP_URL = 'https://biotrakr.hospital.example/';
      await report({
        assetId: VENT,
        description: 'Alarm keeps sounding',
        takeOutOfUse: true,
      });
      await report({
        assetId: PUMP,
        description: 'Label peeling',
        takeOutOfUse: false,
      });
      // Only the urgent one goes out.
      expect(prisma.outbound).toHaveLength(1);
      const payload = prisma.outbound[0].payload as Rec;
      expect(payload).toMatchObject({
        event: 'problem_reported',
        severity: 'critical',
        url: 'https://biotrakr.hospital.example/maintenance',
        // What the nurse typed stays inside the hospital system.
        body: null,
      });
      expect(JSON.stringify(payload)).not.toContain('Alarm keeps sounding');
      expect((payload.recipients as Rec[]).map((r) => r.name).sort()).toEqual([
        'Eli Eng',
        'Tara Tech',
      ]);

      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response('down', { status: 503 }))
        .mockResolvedValueOnce(new Response('ok', { status: 200 }));
      const now = new Date();
      expect(await jobs.deliver(now)).toEqual({ sent: 0, failed: 0 });
      expect(prisma.outbound[0]).toMatchObject({
        attempts: 1,
        lastError: 'HTTP 503',
        sentAt: null,
      });
      // Not retried before its time...
      expect(await jobs.deliver(new Date(now.getTime() + 1000))).toEqual({
        sent: 0,
        failed: 0,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // ...then delivered.
      expect(await jobs.deliver(new Date(now.getTime() + 31_000))).toEqual({
        sent: 1,
        failed: 0,
      });
      expect(prisma.outbound[0].sentAt).toBeInstanceOf(Date);

      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('https://gateway.hospital.example/biotrakr');
      const headers = init.headers as Record<string, string>;
      expect(headers['X-BioTrakr-Signature']).toBe(
        signWebhook(
          'a-long-shared-secret-for-tests',
          Number(headers['X-BioTrakr-Timestamp']),
          init.body as string,
        ),
      );
      expect(init.redirect).toBe('manual');
    });

    it('gives up after the last attempt instead of retrying forever', async () => {
      process.env.NOTIFY_WEBHOOK_URL =
        'https://gateway.hospital.example/biotrakr';
      process.env.NOTIFY_WEBHOOK_SECRET = 'a-long-shared-secret-for-tests';
      await report({
        assetId: VENT,
        description: 'Alarm keeps sounding',
        takeOutOfUse: true,
      });
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('connect ECONNREFUSED'));
      let at = Date.now();
      for (let i = 0; i < 8; i++) {
        await jobs.deliver(new Date(at));
        at += 2 * 60 * 60 * 1000;
      }
      expect(prisma.outbound[0]).toMatchObject({
        attempts: 8,
        lastError: 'connect ECONNREFUSED',
      });
      expect(prisma.outbound[0].failedAt).toBeInstanceOf(Date);
    });

    it('needs a long enough secret before sending anything out', async () => {
      process.env.NOTIFY_WEBHOOK_URL =
        'https://gateway.hospital.example/biotrakr';
      process.env.NOTIFY_WEBHOOK_SECRET = 'short';
      await report({
        assetId: VENT,
        description: 'Alarm keeps sounding',
        takeOutOfUse: true,
      });
      expect(prisma.outbound).toEqual([]);
    });

    it('treats a refused request as final, not something to retry', async () => {
      process.env.NOTIFY_WEBHOOK_URL =
        'https://gateway.hospital.example/biotrakr';
      process.env.NOTIFY_WEBHOOK_SECRET = 'a-long-shared-secret-for-tests';
      await report({
        assetId: VENT,
        description: 'Alarm keeps sounding',
        takeOutOfUse: true,
      });
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('no', { status: 401 }));
      expect(await jobs.deliver()).toEqual({ sent: 0, failed: 1 });
      expect(prisma.outbound[0]).toMatchObject({
        attempts: 1,
        lastError: 'HTTP 401',
      });
    });

    it('does not overwrite a message another instance took over during a slow send', async () => {
      process.env.NOTIFY_WEBHOOK_URL =
        'https://gateway.hospital.example/biotrakr';
      process.env.NOTIFY_WEBHOOK_SECRET = 'a-long-shared-secret-for-tests';
      await report({
        assetId: VENT,
        description: 'Alarm keeps sounding',
        takeOutOfUse: true,
      });
      jest.spyOn(global, 'fetch').mockImplementation(async () => {
        // Our lease ran out and someone else claimed it meanwhile.
        prisma.outbound[0].nextAttemptAt = new Date(Date.now() + 999_999);
        return new Response('ok', { status: 200 });
      });
      expect(await jobs.deliver()).toEqual({ sent: 0, failed: 0 });
      expect(prisma.outbound[0].sentAt).toBeNull();
    });

    it('tells every administrator when the facility has no engineer or admin', async () => {
      prisma.users.find((u) => u.id === ENGINEER)!.isActive = false;
      prisma.users.push({
        id: 'user-admin-hq',
        organizationId: ORG_A,
        firstName: 'Hana',
        lastName: 'HQ',
        role: 'admin',
        isActive: true,
        facilityId: 'fac-2',
      });
      await report({
        assetId: VENT,
        description: 'Alarm keeps sounding',
        takeOutOfUse: true,
      });
      const t0 = (prisma.orders[0].createdAt as Date).getTime();
      expect(await jobs.escalate(new Date(t0 + 16 * MIN))).toBe(1);
      expect(
        prisma.notifications
          .filter((n) => n.kind === 'escalation')
          .map((n) => n.userId),
      ).toEqual(['user-admin-hq']);
      expect(prisma.orders[0].escalatedAfterMinutes).toBe(15);
    });

    it('keeps the report and the quarantine even if recording notices fails', async () => {
      prisma.notification.createMany.mockRejectedValueOnce(
        new Error('deadlock detected'),
      );
      await report({
        assetId: VENT,
        description: 'Alarm keeps sounding',
        takeOutOfUse: true,
      }).expect(201);
      expect(prisma.assets[0].assetStatus).toBe('QUARANTINED');
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'ROLLBACK TO SAVEPOINT notices',
      );
    });

    it('prunes old notices and finished outside messages', async () => {
      const old = new Date(Date.now() - 100 * 86_400_000);
      prisma.notifications.push(
        { id: 'old', createdAt: old },
        { id: 'new', createdAt: new Date() },
      );
      prisma.outbound.push(
        { id: 'sent-old', sentAt: old, failedAt: null },
        { id: 'pending', sentAt: null, failedAt: null },
      );
      expect(await jobs.prune()).toEqual({ notices: 1, outbound: 1 });
      expect(prisma.outbound.map((o) => o.id)).toEqual(['pending']);
    });
  });
});
