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

const YEAR = 365.25 * DAY;
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const COMMITTEE = 'Equipment committee, 14 Oct 2026, minute 6';
const today = () => new Date().toLocaleDateString('en-CA');

describe('Condemnation (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const http = () => request(app.getHttpServer());
  const engineer = bearer('engineer');
  const admin = bearer('admin');

  const propose = (device: number, extra = {}, as = engineer) =>
    http()
      .post('/api/condemnations')
      .set(as)
      .send({
        assetId: assetId(device),
        reasons: ['beyond_economic_repair', 'no_spares'],
        justification:
          'Main board failed; the manufacturer no longer supplies boards for this model.',
        ...extra,
      });
  const decide = (id: string, body: object, as = admin) =>
    http().post(`/api/condemnations/${id}/decision`).set(as).send(body);
  const approve = (id: string) =>
    decide(id, { decision: 'APPROVED', committee: COMMITTEE }).expect(200);
  const dispose = (id: string, body: object, as = engineer) =>
    http()
      .post(`/api/condemnations/${id}/disposal`)
      .set(as)
      .send({
        method: 'E_WASTE_RECYCLER',
        disposedOn: today(),
        note: 'Collected by GreenTech Recyclers; certificate EW/2026/118',
        ...body,
      });
  const withdraw = (id: string, as: Record<string, string>) =>
    http()
      .post(`/api/condemnations/${id}/withdrawal`)
      .set(as)
      .send({ reason: 'Spares found with another vendor' });
  const status = (device: number) =>
    store.assets.find((a) => a.id === assetId(device))!.assetStatus;

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
      purchaseDate: new Date(Date.now() - 9 * YEAR),
      purchaseCost: 250000,
      salvageValue: 25000,
      usefulLifeYears: 10,
    };
    store.assets.push(
      asset(1, { equipmentName: 'ECG machine', ...bought }),
      asset(2, { equipmentName: 'Portable X-ray unit', ...bought }),
      asset(3, { equipmentName: 'Ultrasound machine', ...bought }),
    );
    const breakdown = (n: number, daysAgo: number, open: boolean) => ({
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      assetId: assetId(1),
      workOrderType: 'CORRECTIVE_MAINTENANCE',
      workOrderStatus: open ? 'IN_PROGRESS' : 'COMPLETED',
      createdAt: new Date(Date.now() - daysAgo * DAY),
      completedAt: open ? null : new Date(Date.now() - (daysAgo - 2) * DAY),
      scheduledDate: new Date(),
      description: 'No display',
    });
    store.orders.push(breakdown(91, 100, false), breakdown(92, 3, true));
    app = await createTestApp(store);
  });
  afterEach(async () => {
    await app.close();
  });

  it('proposes a device with its record, once, and tells the administrators', async () => {
    await propose(1, {}, bearer('technician')).expect(403);
    const none = await propose(1, { reasons: [] }).expect(400);
    expect(none.body.message).toContain('Give at least one reason');
    await propose(1, { reasons: ['too_old'] }).expect(400);

    const res = await propose(1, { repairEstimate: 30000 }).expect(201);
    expect(res.body).toMatchObject({
      status: 'PROPOSED',
      proposedBy: 'Eli Engineer',
      repairEstimate: 30000,
      currentValue: null,
      // Straight line: 250000 - 225000 × 9/10.
      evidence: {
        ageYears: 9,
        usefulLifeYears: 10,
        purchaseCost: 250000,
        bookValue: 47500,
        breakdowns: 2,
      },
      repairShare: 63,
    });
    expect(res.body.evidence.downtimeHours).toBeGreaterThanOrEqual(48 + 72);
    // Still in use until the committee decides.
    expect(status(1)).toBe('ACTIVE');

    const again = await propose(1).expect(409);
    expect(again.body.message).toBe(
      'This device is already waiting for the committee',
    );
    expect(
      store.notifications.some(
        (n) => n.kind === 'condemnation' && n.userId === 'user-admin',
      ),
    ).toBe(true);
    expect(store.auditEvents.map((e) => e.action)).toEqual([
      'condemnation.proposed',
    ]);

    const file = await http()
      .get(`/api/condemnations?assetId=${assetId(1)}`)
      .set(bearer('viewer'))
      .expect(200);
    expect(file.body.condemnations).toHaveLength(1);
    expect(file.body.clearance).toBeNull();
  });

  it("condemns only on the committee's approval, recorded by someone else", async () => {
    const { body: c } = await propose(1).expect(201);
    await decide(
      c.id,
      { decision: 'APPROVED', committee: COMMITTEE },
      engineer,
    ).expect(403);
    const unnamed = await decide(c.id, {
      decision: 'APPROVED',
      committee: '',
    }).expect(400);
    expect(unnamed.body.message).toContain(
      'Name the committee meeting: its date and minute number',
    );
    await decide(c.id, { decision: 'REJECTED', committee: COMMITTEE }).expect(
      400,
    );

    // An administrator does not approve their own proposal.
    const { body: own } = await propose(3, {}, admin).expect(201);
    const self = await decide(own.id, {
      decision: 'APPROVED',
      committee: COMMITTEE,
    }).expect(403);
    expect(self.body.message).toBe(
      "Someone other than whoever proposed it records the committee's decision",
    );

    const res = await approve(c.id);
    expect(res.body).toMatchObject({
      status: 'APPROVED',
      decidedBy: 'Ada Admin',
      committee: COMMITTEE,
    });
    expect(status(1)).toBe('CONDEMNED');
    // A condemned device is not repaired any more.
    expect(store.orders.find((o) => o.id.endsWith('92'))?.workOrderStatus).toBe(
      'CANCELLED',
    );
    expect(
      store.notifications.some(
        (n) => n.kind === 'condemnation' && n.userId === 'user-engineer',
      ),
    ).toBe(true);
    expect(store.auditEvents.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        'condemnation.approved',
        'asset.status_changed',
        'work_order.cancelled',
      ]),
    );
    await decide(c.id, { decision: 'APPROVED', committee: COMMITTEE }).expect(
      409,
    );
  });

  it('keeps condemnation and disposal off the plain status change', async () => {
    const change = (device: number, body: object, as: Record<string, string>) =>
      http()
        .post(`/api/assets/${assetId(device)}/status`)
        .set(as)
        .send(body);
    const direct = await change(
      2,
      {
        status: 'CONDEMNED',
        reason: 'Too old to repair',
        expectedStatus: 'ACTIVE',
      },
      admin,
    ).expect(400);
    expect(direct.body.message).toMatch(/^Propose the device for condemnation/);

    const { body: c } = await propose(1).expect(201);
    await approve(c.id);
    const back = {
      status: 'ACTIVE',
      reason: 'Repaired after all',
      expectedStatus: 'CONDEMNED',
      confirmSafe: true,
    };
    await change(1, back, engineer).expect(403);
    const reverse = await change(1, back, admin).expect(400);
    expect(reverse.body.message).toBe(
      'The committee condemned this device: reverse the condemnation on the device page instead',
    );
    expect(status(1)).toBe('CONDEMNED');
  });

  it('withdraws a proposal, and lets only an administrator reverse an approval', async () => {
    const { body: first } = await propose(1).expect(201);
    await withdraw(first.id, bearer('technician')).expect(403);
    const res = await withdraw(first.id, engineer).expect(200);
    expect(res.body).toMatchObject({
      status: 'WITHDRAWN',
      withdrawnBy: 'Eli Engineer',
      withdrawalReason: 'Spares found with another vendor',
    });

    const { body: second } = await propose(1).expect(201);
    await approve(second.id);
    const refused = await withdraw(second.id, engineer).expect(403);
    expect(refused.body.message).toBe(
      "Only an administrator can reverse the committee's approval",
    );
    const reversed = await withdraw(second.id, admin).expect(200);
    // The decision stays on file.
    expect(reversed.body).toMatchObject({
      status: 'WITHDRAWN',
      committee: COMMITTEE,
      decidedBy: 'Ada Admin',
    });
    // Out of use until biomed checks it and releases it.
    expect(status(1)).toBe('QUARANTINED');
    await withdraw(second.id, admin).expect(409);
  });

  it('records the disposal, with the AERB or PC-PNDT clearance it needs', async () => {
    const { body: xray } = await propose(2).expect(201);
    await dispose(xray.id, {}).expect(409);
    await approve(xray.id);
    const future = new Date(Date.now() + 3 * DAY).toLocaleDateString('en-CA');
    await dispose(xray.id, { disposedOn: future }).expect(400);
    const early = await dispose(xray.id, { disposedOn: '2020-01-01' }).expect(
      400,
    );
    expect(early.body.message).toBe(
      "The disposal date is before the committee's decision",
    );
    const aerb = await dispose(xray.id, {}).expect(400);
    expect(aerb.body.message).toMatch(/AERB's decommissioning approval/);
    const done = await dispose(xray.id, {
      clearance: 'eLORA decommissioning approval DR-118/2026, 2 Oct 2026',
    }).expect(200);
    expect(done.body).toMatchObject({
      status: 'DISPOSED',
      disposalMethod: 'E_WASTE_RECYCLER',
      clearance: 'eLORA decommissioning approval DR-118/2026, 2 Oct 2026',
    });
    expect(status(2)).toBe('DISPOSED');
    await dispose(xray.id, {}).expect(409);

    // Ultrasound: a NOC to sell it, none to have it recycled.
    const { body: usg } = await propose(3).expect(201);
    const file = await http()
      .get(`/api/condemnations?assetId=${assetId(3)}`)
      .set(engineer)
      .expect(200);
    expect(file.body.clearance.kind).toBe('pc-pndt');
    await approve(usg.id);
    const sold = await dispose(usg.id, { method: 'AUCTION' }).expect(400);
    expect(sold.body.message).toMatch(/PC-PNDT Appropriate Authority/);
    await dispose(usg.id, {}).expect(200);

    const register = await http()
      .get('/api/registers/condemnation')
      .set(bearer('viewer'))
      .expect(200);
    expect(register.body.rows).toHaveLength(2);
    expect(register.body.rows[0]).toMatchObject({
      device: 'TAG-2 · Portable X-ray unit',
      age: '9 / 10 years',
      reasons: 'Beyond economic repair; Spares or service no longer available',
      value: '₹47,500 (book)',
      proposed: expect.stringMatching(/\(Eli Engineer\)$/),
      decision: expect.stringMatching(
        new RegExp(`^Approved .*, ${COMMITTEE}$`),
      ),
      disposal: expect.stringMatching(
        /^Authorised e-waste recycler, .*: Collected by GreenTech Recyclers; certificate EW\/2026\/118\. Clearance: eLORA/,
      ),
      file: 'No',
    });
  });

  it('keeps the committee minutes and certificates in the condemnation file', async () => {
    const { body: c } = await propose(1).expect(201);
    const res = await http()
      .post('/api/documents')
      .set(engineer)
      .field('targetType', 'condemnation')
      .field('targetId', c.id)
      .attach('file', PDF, 'Committee minutes 14 Oct.pdf')
      .expect(201);
    expect(res.body).toMatchObject({
      category: 'CONDEMNATION',
      condemnationId: c.id,
      assetId: assetId(1),
    });
    const file = await http()
      .get(`/api/condemnations?assetId=${assetId(1)}`)
      .set(engineer)
      .expect(200);
    expect(file.body.condemnations[0].files).toBe(1);
    const listed = await http()
      .get(`/api/documents?targetType=condemnation&targetId=${c.id}`)
      .set(bearer('viewer'))
      .expect(200);
    expect(listed.body).toHaveLength(1);
  });
});
