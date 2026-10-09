import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { formatDay, PmJobsService, pmConfig } from '../src/pm/pm-jobs.service';
import {
  asset,
  assetId,
  buildStore,
  DAY,
  type DeviceStore,
  FAC_2,
} from './device-store';
import { bearer, createTestApp, ORG_A, ORG_B } from './helpers';

describe('PM schedule (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  let jobs: PmJobsService;
  const now = new Date();
  const ahead = (days: number) => new Date(now.getTime() + days * DAY);

  beforeEach(async () => {
    delete process.env.PM_LEAD_DAYS;
    store = buildStore();
    store.assets.push(
      asset(1, { nextPmDueDate: ahead(-10), criticalityLevel: 'CRITICAL' }), // overdue
      asset(2, { nextPmDueDate: ahead(5), pmProcedureDocument: 'SOP-12' }), // within 14 days
      asset(3, { nextPmDueDate: ahead(30) }), // later
      asset(4, { nextPmDueDate: ahead(2), autoGenerateWorkOrders: false }),
      asset(5, { nextPmDueDate: ahead(-1), assetStatus: 'RETIRED' }),
      asset(6, { nextPmDueDate: ahead(-1), deletedAt: new Date() }),
      asset(7, { nextPmDueDate: null }),
      asset(8, { nextPmDueDate: ahead(1), currentFacilityId: FAC_2 }),
      asset(9, { nextPmDueDate: ahead(1), organizationId: ORG_B }),
      asset(10, { nextPmDueDate: ahead(3) }), // already has a PM open
    );
    store.orders.push({
      id: 'wo-open-pm',
      assetId: assetId(10),
      workOrderType: 'PREVENTIVE_MAINTENANCE',
      workOrderStatus: 'IN_PROGRESS',
      scheduledDate: ahead(3),
      createdAt: ahead(-1),
      createdByUserId: 'user-technician',
      assignedTechnicianId: 'user-technician',
    });
    app = await createTestApp(store);
    jobs = app.get(PmJobsService);
  });
  afterEach(async () => {
    await app.close();
  });

  const opened = () =>
    store.orders
      .filter((o) => o.createdByUserId === null)
      .map((o) => o.assetId)
      .sort();

  describe('opening work orders ahead of time', () => {
    it('opens one for each device due within 14 days that has none open', async () => {
      await expect(jobs.openDue(now)).resolves.toEqual({ opened: 4 });
      // Overdue, due in 5 days, another facility's, another organization's.
      expect(opened()).toEqual(
        [assetId(1), assetId(2), assetId(8), assetId(9)].sort(),
      );
      expect(store.orders.find((o) => o.assetId === assetId(2))).toMatchObject({
        workOrderType: 'PREVENTIVE_MAINTENANCE',
        workOrderStatus: 'PENDING',
        scheduledDate: ahead(5),
        pmDueDate: ahead(5),
        createdByUserId: null,
        description: `Preventive maintenance due ${formatDay(ahead(5))}\nProcedure: SOP-12`,
      });
    });

    it('never opens the same one twice, even when run again or by another instance', async () => {
      await jobs.openDue(now);
      await expect(jobs.openDue(now)).resolves.toEqual({ opened: 0 });
      // Another instance that read the same devices before this one wrote.
      store.orders
        .filter((o) => o.createdByUserId === null)
        .forEach((o) => (o.workOrderStatus = 'CANCELLED'));
      await expect(jobs.openDue(now)).resolves.toEqual({ opened: 0 });
      expect(opened()).toHaveLength(4);
    });

    it('leaves a cancelled PM alone until the next due date', async () => {
      await jobs.openDue(now);
      const wo = store.orders.find((o) => o.assetId === assetId(1))!;
      wo.workOrderStatus = 'CANCELLED';
      await expect(jobs.openDue(now)).resolves.toEqual({ opened: 0 });

      // A PM is done (by hand): the next due date gets its own work order.
      store.assets[0].nextPmDueDate = ahead(7);
      await expect(jobs.openDue(now)).resolves.toEqual({ opened: 1 });
    });

    it('uses PM_LEAD_DAYS for how far ahead to open', async () => {
      process.env.PM_LEAD_DAYS = '45';
      await jobs.openDue(now);
      expect(opened()).toContain(assetId(3));
      process.env.PM_LEAD_DAYS = 'nonsense';
      expect(pmConfig().leadDays).toBe(14);
      process.env.PM_LEAD_DAYS = '0';
      expect(pmConfig().leadDays).toBe(0);
    });

    it('tells biomed at each facility once per run, naming the devices', async () => {
      await jobs.openDue(now);
      const notices = store.notifications.filter(
        (n) => n.organizationId === ORG_A,
      );
      const who = (title: string) =>
        notices
          .filter((n) => n.title === title)
          .map((n) => n.userId)
          .sort();
      // City General: its technician, and the admin (who covers every site).
      expect(who('2 preventive maintenance jobs opened')).toEqual([
        'user-admin',
        'user-technician',
      ]);
      // North Clinic: its own technician, and the admin.
      expect(who('PM due: Device 8 (TAG-8)')).toEqual([
        'user-admin',
        'user-tech-2',
      ]);
      expect(notices).toHaveLength(4);
      expect(notices[0]).toMatchObject({
        kind: 'pm_due',
        severity: 'info',
        link: '/maintenance/schedule',
      });
      expect(notices.find((n) => n.userId === 'user-technician')!.body).toBe(
        'Device 1 (TAG-1)\nDevice 2 (TAG-2)',
      );
      // Ward staff are not told about PM.
      expect(notices.some((n) => n.userId === 'user-clinical_staff')).toBe(
        false,
      );
    });

    it('can be run by an administrator for their own organization', async () => {
      await request(app.getHttpServer())
        .post('/api/pm/run')
        .set(bearer('technician'))
        .expect(403);
      const { body } = await request(app.getHttpServer())
        .post('/api/pm/run')
        .set(bearer('admin'))
        .expect(200);
      expect(body).toEqual({ opened: 3 });
      expect(opened()).not.toContain(assetId(9));
    });
  });

  describe('opening one by hand', () => {
    const open = (
      id: string,
      role: Parameters<typeof bearer>[0] = 'technician',
    ) =>
      request(app.getHttpServer())
        .post('/api/pm/work-orders')
        .set(bearer(role))
        .send({ assetId: id });

    it('opens a PM work order now, on the due date if that is still ahead', async () => {
      const { body } = await open(assetId(3)).expect(201);
      expect(store.orders.find((o) => o.id === body.workOrderId)).toMatchObject(
        {
          assetId: assetId(3),
          workOrderType: 'PREVENTIVE_MAINTENANCE',
          scheduledDate: ahead(30),
          pmDueDate: null,
          createdByUserId: 'user-technician',
        },
      );
      // The device is locked first, so two people at once get one work order.
      expect(store.$queryRaw).toHaveBeenCalled();
    });

    it('refuses a second open PM, a retired device and other organizations’ devices', async () => {
      const { body } = await open(assetId(10)).expect(409);
      expect(body).toMatchObject({ workOrderId: 'wo-open-pm' });
      await open(assetId(5)).expect(400);
      await open(assetId(9)).expect(404);
      await open('not-a-uuid').expect(400);
      await open(assetId(3), 'clinical_staff').expect(403);
    });
  });

  describe('the calendar', () => {
    const schedule = (
      query: string,
      role: Parameters<typeof bearer>[0] = 'technician',
    ) =>
      request(app.getHttpServer())
        .get(`/api/pm/schedule?${query}`)
        .set(bearer(role));

    it('lists devices due in the range with their work order, PM done, and everything overdue', async () => {
      store.orders.push({
        id: 'wo-done',
        assetId: assetId(3),
        workOrderType: 'PREVENTIVE_MAINTENANCE',
        workOrderStatus: 'COMPLETED',
        completedAt: ahead(-2),
        createdAt: ahead(-3),
        assignedTechnicianId: 'user-technician',
      });
      const from = ahead(-7).toISOString();
      const to = ahead(21).toISOString();
      const { body } = await schedule(`from=${from}&to=${to}`).expect(200);

      expect(body.leadDays).toBe(14);
      expect(body.due.map((d: { id: string }) => d.id)).toEqual([
        assetId(8),
        assetId(4),
        assetId(10),
        assetId(2),
      ]);
      expect(
        body.due.find((d: { id: string }) => d.id === assetId(10)),
      ).toMatchObject({
        assetTagNumber: 'TAG-10',
        dueDate: ahead(3).toISOString(),
        intervalDays: 90,
        location: 'ICU, City General',
        workOrder: {
          id: 'wo-open-pm',
          status: 'IN_PROGRESS',
          assignedTo: 'Tara Tech',
        },
      });
      expect(body.overdue).toEqual({
        total: 1,
        items: [expect.objectContaining({ id: assetId(1), workOrder: null })],
      });
      expect(body.done).toEqual([
        {
          id: 'wo-done',
          completedAt: ahead(-2).toISOString(),
          asset: {
            id: assetId(3),
            assetTagNumber: 'TAG-3',
            equipmentName: 'Device 3',
          },
          doneBy: 'Tara Tech',
        },
      ]);
      expect(body.truncated).toBe(false);
    });

    it('narrows to a facility and checks the range', async () => {
      const from = ahead(-7).toISOString();
      const to = ahead(21).toISOString();
      const { body } = await schedule(
        `from=${from}&to=${to}&facilityId=${FAC_2}`,
      ).expect(200);
      expect(body.due.map((d: { id: string }) => d.id)).toEqual([assetId(8)]);
      expect(body.overdue.total).toBe(0);

      await schedule(`from=${to}&to=${from}`).expect(400);
      await schedule(`from=${from}&to=${ahead(100).toISOString()}`).expect(400);
      await schedule(`from=yesterday&to=${to}`).expect(400);
      await schedule(`from=${from}&to=${to}`, 'clinical_staff').expect(403);
    });
  });
});
