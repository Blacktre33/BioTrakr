import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  asset,
  assetId,
  buildStore,
  DAY,
  type DeviceStore,
} from './device-store';
import { bearer, createTestApp, ORG_A } from './helpers';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const dayText = (d: Date) => d.toLocaleDateString('en-CA');

describe('Training (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const http = () => request(app.getHttpServer());
  const engineer = bearer('engineer');

  const session = (extra: object = {}) => ({
    heldOn: dayText(new Date(Date.now() - 2 * DAY)),
    kind: 'OPERATOR',
    topic: 'Loading, alarms and occlusion pressure',
    equipment: 'BD Alaris syringe pumps',
    trainer: 'Priya Menon',
    trainerFrom: 'BD India (application specialist)',
    durationHours: 1.5,
    deviceIds: [assetId(2), assetId(1)],
    attendees: [
      {
        name: 'Rahul Verma',
        designation: 'Staff nurse',
        department: 'ICU',
        assessment: 'NEEDS_RETRAINING',
      },
      {
        name: 'Asha Rao',
        designation: 'Staff nurse',
        department: 'ICU',
        assessment: 'PASSED',
      },
      { name: 'Meena K', assessment: 'PASSED' },
    ],
    ...extra,
  });
  /** Everything the edit history holds, to look for names in. */
  const auditText = () =>
    JSON.stringify(store.auditEvents, (_, v: unknown) =>
      typeof v === 'bigint' ? String(v) : v,
    );
  const record = (extra: object = {}, as = engineer) =>
    http().post('/api/training').set(as).send(session(extra));

  beforeEach(async () => {
    store = buildStore();
    store.users.push({
      id: 'user-engineer',
      organizationId: ORG_A,
      firstName: 'Eli',
      lastName: 'Engineer',
      role: 'engineer',
      isActive: true,
      facilityId: null,
    });
    const bought = {
      purchaseDate: new Date('2024-04-01T06:30:00Z'),
      purchaseCost: 60000,
      salvageValue: 0,
      usefulLifeYears: 7,
      deviceCategory: 'THERAPEUTIC',
    };
    store.assets.push(
      asset(1, { equipmentName: 'Syringe pump', ...bought }),
      asset(2, { equipmentName: 'Syringe pump', ...bought }),
      asset(3, { equipmentName: 'Ventilator' }),
    );
    app = await createTestApp(store);
  });
  afterEach(async () => {
    await app.close();
  });

  it('records a session, the devices it covered and who attended', async () => {
    await record({}, bearer('technician')).expect(403);
    const nobody = await record({ attendees: [] }).expect(400);
    expect(nobody.body.message).toContain('Add at least one attendee');
    const future = await record({
      heldOn: dayText(new Date(Date.now() + 3 * DAY)),
    }).expect(400);
    expect(future.body.message).toBe('The training date is in the future');
    await record({
      deviceIds: ['aa000000-0000-4000-8000-000000000099'],
    }).expect(400);

    const res = await record().expect(201);
    expect(res.body).toMatchObject({
      kind: 'OPERATOR',
      trainer: 'Priya Menon',
      durationHours: 1.5,
      recordedBy: 'Eli Engineer',
      files: 0,
    });
    expect(
      res.body.devices.map((d: { assetTagNumber: string }) => d.assetTagNumber),
    ).toEqual(['TAG-1', 'TAG-2']);
    expect(res.body.attendees.map((a: { name: string }) => a.name)).toEqual([
      'Asha Rao',
      'Meena K',
      'Rahul Verma',
    ]);

    const covered = await http()
      .get(`/api/training?assetId=${assetId(1)}`)
      .set(bearer('viewer'))
      .expect(200);
    expect(covered.body).toHaveLength(1);
    const other = await http()
      .get(`/api/training?assetId=${assetId(3)}`)
      .set(bearer('viewer'))
      .expect(200);
    expect(other.body).toHaveLength(0);

    // Names are personal details: the edit history says how many, not who.
    expect(store.auditEvents).toHaveLength(1);
    expect(store.auditEvents[0]).toMatchObject({
      action: 'training.recorded',
      summary:
        'Recorded operator training on BD Alaris syringe pumps: Loading, alarms and occlusion pressure (3 attended)',
    });
    expect(auditText()).not.toMatch(/Asha|Rahul|Meena/);
  });

  it('corrects a session, with the changes in the edit history', async () => {
    const { body: s } = await record().expect(201);
    const patch = (extra: object) =>
      http().patch(`/api/training/${s.id}`).set(engineer).send(session(extra));

    await patch({
      topic: 'Loading, alarms, occlusion pressure and cleaning',
      deviceIds: [assetId(1)],
      attendees: [
        ...session().attendees,
        { name: 'Joseph D', assessment: 'NOT_ASSESSED' },
      ],
    }).expect(200);
    const [, updated] = store.auditEvents;
    expect(updated).toMatchObject({
      action: 'training.updated',
      assetId: assetId(1),
    });
    expect(updated.changes).toEqual(
      expect.arrayContaining([
        {
          field: 'topic',
          label: 'Topic',
          from: 'Loading, alarms and occlusion pressure',
          to: 'Loading, alarms, occlusion pressure and cleaning',
        },
        {
          field: 'devices',
          label: 'Devices covered',
          from: 'TAG-1, TAG-2',
          to: 'TAG-1',
        },
        {
          field: 'attendees',
          label: 'Attendees',
          from: '3 (2 passed, 1 needs retraining)',
          to: '4 (2 passed, 1 needs retraining, 1 not assessed)',
        },
      ]),
    );

    // A name corrected: recorded as changed, without the names.
    const fixed = session().attendees.map((a) =>
      a.name === 'Meena K' ? { ...a, name: 'Meena Krishnan' } : a,
    );
    await patch({
      topic: 'Loading, alarms, occlusion pressure and cleaning',
      deviceIds: [assetId(1)],
      attendees: [...fixed, { name: 'Joseph D', assessment: 'NOT_ASSESSED' }],
    }).expect(200);
    expect(store.auditEvents[2].changes).toEqual([
      {
        field: 'attendees',
        label: 'Attendees',
        from: null,
        to: null,
        hidden: true,
      },
    ]);
    expect(auditText()).not.toMatch(/Meena/);
    await http()
      .patch('/api/training/7a000000-0000-4000-8000-000000000099')
      .set(engineer)
      .send(session())
      .expect(404);
  });

  it('prints the training register, and shows training on the history card', async () => {
    const { body: s } = await record().expect(201);
    await http()
      .post('/api/documents')
      .set(engineer)
      .field('targetType', 'training')
      .field('targetId', s.id)
      .attach('file', PDF, 'Attendance sheet.pdf')
      .expect(201)
      .expect((res) =>
        expect(res.body).toMatchObject({
          category: 'TRAINING',
          trainingSessionId: s.id,
          assetId: null,
        }),
      );

    const register = await http()
      .get('/api/registers/training')
      .set(bearer('viewer'))
      .expect(200);
    expect(register.body.title).toBe('Equipment Training Register');
    expect(register.body.rows[0]).toMatchObject({
      topic: 'Loading, alarms and occlusion pressure',
      kind: 'Operator',
      equipment: 'BD Alaris syringe pumps (TAG-1, TAG-2)',
      trainer: 'Priya Menon, BD India (application specialist)',
      hours: 1.5,
      attended: 3,
      assessed: '2 passed, 1 needs retraining',
      attendees:
        'Asha Rao (Staff nurse, ICU); Meena K; Rahul Verma (Staff nurse, ICU)',
      file: 'Yes',
    });

    const card = await http()
      .get(`/api/registers/history?assetId=${assetId(1)}`)
      .set(engineer)
      .expect(200);
    const line = card.body.rows.find(
      (r: { event: string }) => r.event === 'Operator training',
    );
    expect(line).toMatchObject({
      details:
        'Loading, alarms and occlusion pressure; 3 attended: 2 passed, 1 needs retraining',
      by: 'Priya Menon, BD India (application specialist)',
    });
  });
});
