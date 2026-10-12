import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { BUILT_IN_CHECKLISTS } from '../src/pm/checklists';
import { asset, assetId, buildStore, type DeviceStore } from './device-store';
import { bearer, createTestApp } from './helpers';

const MONITOR = BUILT_IN_CHECKLISTS.find(
  (c) => c.key === 'builtin:patient-monitor',
)!;
const orderId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Every item of the patient monitor checklist passed, readings in range. */
const passing = () =>
  MONITOR.items.map((i) =>
    i.kind === 'reading'
      ? { key: i.key, reading: ((i.min ?? 0) + (i.max ?? 0)) / 2 }
      : { key: i.key, result: 'PASS' },
  );

describe('PM checklists (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const http = () => request(app.getHttpServer());
  const tech = bearer('technician');

  const pmOrder = (n: number, device: number) => {
    const row = {
      id: orderId(n),
      assetId: assetId(device),
      workOrderType: 'PREVENTIVE_MAINTENANCE',
      workOrderStatus: 'IN_PROGRESS',
      scheduledDate: new Date(),
      dueDate: new Date(),
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      isEmergency: false,
      assignedTechnicianId: 'user-technician',
      createdByUserId: null,
      description: 'Preventive maintenance due',
    };
    store.orders.push(row);
    return row;
  };
  const complete = (id: string, items: unknown[], extra = {}) =>
    http()
      .patch(`/api/work-orders/${id}`)
      .set(tech)
      .send({
        expectedStatus: 'IN_PROGRESS',
        status: 'COMPLETED',
        workPerformed: 'Quarterly PM per checklist',
        checklist: {
          checklistKey: MONITOR.key,
          testEquipment: 'Fluke ProSim 8, SN 41, calibrated 2026-04',
          items,
        },
        ...extra,
      });

  beforeEach(async () => {
    store = buildStore();
    store.assets.push(
      asset(1, {
        equipmentName: 'Patient monitor',
        criticalityLevel: 'CRITICAL',
        deviceCategory: 'PATIENT_MONITORING',
      }),
      asset(2, { equipmentName: 'Autoclave' }),
    );
    app = await createTestApp(store);
  });
  afterEach(async () => {
    await app.close();
  });

  it('suggests the checklist for a device from its name', async () => {
    const res = await http()
      .get(`/api/pm/checklists?assetId=${assetId(1)}`)
      .set(tech)
      .expect(200);
    expect(res.body.suggested).toBe('builtin:patient-monitor');
    expect(res.body.checklists.map((c: { key: string }) => c.key)).toContain(
      'builtin:general',
    );
    const other = await http()
      .get(`/api/pm/checklists?assetId=${assetId(2)}`)
      .set(tech)
      .expect(200);
    expect(other.body.suggested).toBe('builtin:general');
  });

  it("lets biomed engineers write the hospital's own checklists, which come first", async () => {
    const own = {
      name: 'Philips IntelliVue MX450',
      keywords: ['Patient Monitor'],
      items: [
        { key: 'housing', text: 'Housing intact', kind: 'check' },
        {
          key: 'nibp',
          text: 'NIBP at 150 mmHg',
          kind: 'reading',
          unit: 'mmHg',
          min: 147,
          max: 153,
        },
      ],
    };
    const bad = await http()
      .post('/api/pm/checklists')
      .set(bearer('engineer'))
      .send({
        ...own,
        items: [{ key: 'flow', text: 'Flow', kind: 'reading', min: 9, max: 1 }],
      })
      .expect(400);
    expect(bad.body.message).toEqual([
      'Item 1: give the unit',
      'Item 1: the lowest value is above the highest',
    ]);
    await http().post('/api/pm/checklists').set(tech).send(own).expect(403);

    const created = await http()
      .post('/api/pm/checklists')
      .set(bearer('engineer'))
      .send(own)
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Philips IntelliVue MX450',
      keywords: ['patient monitor'],
      builtIn: false,
      active: true,
    });
    await http()
      .post('/api/pm/checklists')
      .set(bearer('engineer'))
      .send(own)
      .expect(409);

    const suggested = async () =>
      (
        await http()
          .get(`/api/pm/checklists?assetId=${assetId(1)}`)
          .set(tech)
          .expect(200)
      ).body.suggested;
    expect(await suggested()).toBe(created.body.key);

    // Retired: no longer offered, past PMs keep what they recorded.
    await http()
      .patch(`/api/pm/checklists/${created.body.key}`)
      .set(bearer('engineer'))
      .send({ ...own, active: false })
      .expect(200);
    expect(await suggested()).toBe('builtin:patient-monitor');
    expect(store.auditEvents.map((e) => e.action)).toEqual([
      'checklist.created',
      'checklist.updated',
    ]);
    expect(store.auditEvents[1].changes).toEqual([
      { field: 'active', label: 'Offered', from: 'Yes', to: 'No' },
    ]);
  });

  it('keeps what a PM found, flagged items included, and shows it in the registers', async () => {
    const wo = pmOrder(10, 1);
    const unanswered = await complete(wo.id, passing().slice(1)).expect(400);
    expect(unanswered.body.message).toEqual([
      'Answer: Housing, knobs and mounts intact; no cracks, spills or loose parts',
    ]);
    const items = passing().map((a) =>
      a.key === 'battery'
        ? {
            key: a.key,
            result: 'FLAG',
            note: 'Holds charge 40 min; order a battery',
          }
        : a,
    );
    const res = await complete(wo.id, items).expect(200);
    expect(res.body.pmOutcome).toBe('FLAG');
    expect(store.pmRecords[0]).toMatchObject({
      workOrderId: wo.id,
      checklistKey: 'builtin:patient-monitor',
      outcome: 'FLAG',
      recordedById: 'user-technician',
    });
    // A flag leaves the device in use.
    expect(store.assets[0].assetStatus).toBe('ACTIVE');

    const records = await http()
      .get(`/api/pm/records/${assetId(1)}`)
      .set(bearer('viewer'))
      .expect(200);
    expect(records.body[0]).toMatchObject({
      outcome: 'FLAG',
      recordedBy: 'Tara Tech',
      testEquipment: 'Fluke ProSim 8, SN 41, calibrated 2026-04',
    });
    expect(records.body[0].items).toHaveLength(MONITOR.items.length);

    const register = await http()
      .get('/api/registers/pm')
      .set(bearer('viewer'))
      .expect(200);
    expect(register.body.rows[0]).toMatchObject({
      checklist:
        'Pass, 1 flagged: Battery charges and runs the device without mains (Holds charge 40 min; order a battery) (Patient monitor)',
      equipment: 'Fluke ProSim 8, SN 41, calibrated 2026-04',
    });
    const logbook = await http()
      .get(`/api/registers/logbook?assetId=${assetId(1)}`)
      .set(bearer('viewer'))
      .expect(200);
    expect(logbook.body.rows[0].check).toMatch(
      /^PM done .* by Tara Tech, pass, 1 flagged$/,
    );
  });

  it('takes a device that fails its PM out of use and opens the repair', async () => {
    const wo = pmOrder(11, 1);
    const items = passing().map((a) =>
      a.key === 'nibp-static'
        ? { key: a.key, reading: 209, note: 'Reads 9 mmHg high' }
        : a,
    );
    // Never released while a check has failed.
    const release = await complete(wo.id, items, {
      releaseDevice: true,
      confirmSafe: true,
    }).expect(400);
    expect(release.body.message).toBe(
      'The device failed its PM: it stays out of use until the fault is repaired',
    );

    const res = await complete(wo.id, items).expect(200);
    expect(res.body.pmOutcome).toBe('FAIL');
    const device = store.assets[0];
    expect(device.assetStatus).toBe('QUARANTINED');
    expect(device.lastPmDate).toBeInstanceOf(Date);
    const repair = store.orders.find(
      (o) => o.workOrderType === 'CORRECTIVE_MAINTENANCE',
    )!;
    expect(repair).toMatchObject({
      workOrderStatus: 'PENDING',
      isEmergency: true,
      createdByUserId: 'user-technician',
      description:
        'Fault found at preventive maintenance: NIBP pressure check against a reference at 200 mmHg: Reads 9 mmHg high',
    });
    expect(
      store.notifications.some(
        (n) => n.kind === 'pm_failed' && n.userId === 'user-admin',
      ),
    ).toBe(true);
    expect(store.auditEvents.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        'work_order.completed',
        'pm_checklist.recorded',
        'asset.status_changed',
        'work_order.reported',
      ]),
    );
  });
});
