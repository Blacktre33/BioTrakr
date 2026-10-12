import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PmJobsService } from '../src/pm/pm-jobs.service';
import {
  asset,
  assetId,
  buildStore,
  DAY,
  type DeviceStore,
} from './device-store';
import { bearer, createTestApp, ORG_B } from './helpers';

describe('Edit history (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const http = () => request(app.getHttpServer());
  const history = (
    headers = bearer('viewer'),
    query = `assetId=${assetId(1)}`,
  ) => http().get(`/api/audit?${query}`).set(headers);

  beforeEach(async () => {
    store = buildStore();
    store.assets.push(
      asset(1, { equipmentName: 'Syringe pump', criticalityLevel: 'MEDIUM' }),
      asset(2, { nextPmDueDate: new Date(Date.now() + 3 * DAY) }),
    );
    app = await createTestApp(store);
  });
  afterEach(async () => {
    await app.close();
  });

  it('keeps every change to a device, newest first: who, what changed and why', async () => {
    await http()
      .patch(`/api/assets/${assetId(1)}`)
      .set(bearer('admin'))
      .send({ criticalityLevel: 'HIGH', equipmentName: 'Syringe pump' })
      .expect(200);
    // Saving without changing anything adds nothing.
    await http()
      .patch(`/api/assets/${assetId(1)}`)
      .set(bearer('admin'))
      .send({ equipmentName: 'Syringe pump' })
      .expect(200);
    await http()
      .post(`/api/assets/${assetId(1)}/status`)
      .set(bearer('technician'))
      .send({
        status: 'QUARANTINED',
        expectedStatus: 'ACTIVE',
        reason: 'Occlusion alarm at every start',
      })
      .expect(200);
    const report = await http()
      .post('/api/work-orders/problem-reports')
      .set(bearer('clinical_staff'))
      .send({
        assetId: assetId(1),
        description: 'Alarm keeps sounding',
        takeOutOfUse: false,
      })
      .expect(201);

    const res = await history().expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toEqual([
      expect.objectContaining({
        seq: 3,
        action: 'work_order.reported',
        entityType: 'work_order',
        entityId: report.body.workOrderId,
        actor: { id: 'user-clinical_staff', name: 'Nia Nurse' },
        actorRole: 'clinical_staff',
        summary: 'Problem reported on TAG-1',
        reason: 'Alarm keeps sounding',
        device: 'TAG-1 · Syringe pump',
      }),
      expect.objectContaining({
        seq: 2,
        action: 'asset.status_changed',
        actor: { id: 'user-technician', name: 'Tara Tech' },
        summary: 'TAG-1: Active → Quarantined',
        reason: 'Occlusion alarm at every start',
      }),
      expect.objectContaining({
        seq: 1,
        action: 'asset.updated',
        summary: 'Edited TAG-1: Criticality',
        changes: [
          {
            field: 'criticalityLevel',
            label: 'Criticality',
            from: 'Medium',
            to: 'High',
          },
        ],
      }),
    ]);

    // Biomed and auditors read it; ward staff and other hospitals do not.
    await history(bearer('clinical_staff')).expect(403);
    expect((await history(bearer('viewer', ORG_B))).body.total).toBe(0);
  });

  it('records work the schedule opened as done by the system', async () => {
    await app.get(PmJobsService).openDue(new Date());
    const res = await history(bearer('engineer'), `assetId=${assetId(2)}`);
    expect(res.body.items).toEqual([
      expect.objectContaining({
        action: 'work_order.opened',
        actor: null,
        actorRole: 'system',
        summary: expect.stringMatching(
          /^Preventive maintenance due .*: opened by the schedule for TAG-2$/,
        ),
      }),
    ]);
  });

  it('recomputes the hash chain on request', async () => {
    store.$queryRaw.mockResolvedValueOnce([
      { entries: 3n, lastSeq: 3n, lastHash: 'ab'.repeat(32), brokenAt: null },
    ]);
    const res = await http()
      .get('/api/audit/check')
      .set(bearer('viewer'))
      .expect(200);
    expect(res.body).toMatchObject({
      entries: 3,
      lastSeq: 3,
      lastHash: 'ab'.repeat(32),
      brokenAt: null,
    });
  });

  it('tells administrators, once, when an entry no longer matches', async () => {
    store.$queryRaw.mockImplementation(async () => [
      { entries: 5n, lastSeq: 5n, lastHash: 'cd'.repeat(32), brokenAt: 4n },
    ]);
    const jobs = app.get(PmJobsService);
    await jobs.tick();
    await jobs.tick();
    const notices = store.notifications.filter(
      (n) => n.kind === 'audit_chain_broken',
    );
    // ORG_A's administrator; checked once a day, and never told twice.
    expect(notices).toEqual([
      expect.objectContaining({
        userId: 'user-admin',
        severity: 'critical',
        title: 'The edit history has been altered',
        body: expect.stringMatching(/^Entry 4 and the ones after it/),
      }),
    ]);
  });

  it('prints as a register, with the chain check and the latest hash', async () => {
    await http()
      .patch(`/api/assets/${assetId(1)}`)
      .set(bearer('admin'))
      .send({ criticalityLevel: 'HIGH' })
      .expect(200);
    store.$queryRaw.mockResolvedValueOnce([
      { entries: 1n, lastSeq: 1n, lastHash: 'ef'.repeat(32), brokenAt: null },
    ]);
    const res = await http()
      .get('/api/registers/audit')
      .set(bearer('viewer'))
      .expect(200);
    expect(res.body.title).toBe('Edit History (Audit Trail)');
    expect(res.body.rows).toEqual([
      expect.objectContaining({
        entry: 1,
        by: 'Ada Admin (admin)',
        what: 'Edited TAG-1: Criticality',
        changes: 'Criticality: Medium → High',
      }),
    ]);
    expect(res.body.notes[0]).toMatch(
      /^Hash chain checked .*: intact, 1 entry in all/,
    );
    expect(res.body.notes[1]).toContain(`SHA-256 ${'ef'.repeat(32)}`);
  });
});
