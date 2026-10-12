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
import { bearer, ORG_B, createTestApp } from './helpers';

/** A routine in-house test of a Class I monitor with BF applied parts. */
const readings = (over: Record<string, unknown> = {}) => ({
  testedAt: new Date(Date.now() - DAY).toISOString(),
  reason: 'ROUTINE',
  provider: 'IN_HOUSE',
  analyzer: 'Rigel 288+, SN 12345, calibrated 2026-04',
  electricalClass: 'CLASS_I',
  appliedPartType: 'BF',
  leakageMethod: 'DIRECT',
  visualInspectionPassed: true,
  functionalTestPassed: true,
  earthResistanceOhm: 0.12,
  insulationMainsMOhm: 250,
  equipmentLeakageUa: 85,
  appliedPartLeakageUa: 12,
  ...over,
});

describe('Electrical safety tests (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const now = new Date();
  const ahead = (days: number) => new Date(now.getTime() + days * DAY);
  const tech = bearer('technician');
  const http = () => request(app.getHttpServer());
  const device = (n: number) => store.assets.find((a) => a.id === assetId(n))!;

  beforeEach(async () => {
    delete process.env.PM_LEAD_DAYS;
    store = buildStore();
    store.assets.push(
      asset(1, { requiresSafetyTest: true, nextSafetyInspectionDue: ahead(5) }),
      asset(2, {
        requiresSafetyTest: true,
        nextSafetyInspectionDue: ahead(40),
      }),
      asset(3, {
        requiresSafetyTest: false,
        nextSafetyInspectionDue: ahead(1),
      }),
      // Calibration and safety test due the same day: both open.
      asset(4, {
        requiresSafetyTest: true,
        nextSafetyInspectionDue: ahead(2),
        requiresCalibration: true,
        nextCalibrationDue: ahead(2),
      }),
      asset(5, {
        requiresSafetyTest: true,
        nextSafetyInspectionDue: ahead(-3),
        safetyTestFrequencyDays: 180,
        electricalClass: 'CLASS_II',
        appliedPartType: 'CF',
      }),
    );
    app = await createTestApp(store);
  });
  afterEach(async () => {
    await app.close();
  });

  const openSchedule = () => app.get(PmJobsService).openDue(now);
  const testOrder = (n: number) =>
    store.orders.find(
      (o) =>
        o.assetId === assetId(n) &&
        o.workOrderType === 'ELECTRICAL_SAFETY_TEST' &&
        o.workOrderStatus === 'PENDING',
    )!;
  const complete = (
    orderId: string,
    body: Record<string, unknown>,
    headers = tech,
  ) =>
    http()
      .patch(`/api/work-orders/${orderId}`)
      .set(headers)
      .send({
        expectedStatus: 'PENDING',
        status: 'COMPLETED',
        workPerformed: 'Tested to IS/IEC 62353',
        ...body,
      });

  it('opens safety test work orders ahead of the due date, next to calibration', async () => {
    await openSchedule();
    const tests = store.orders
      .filter((o) => o.workOrderType === 'ELECTRICAL_SAFETY_TEST')
      .map((o) => o.assetId)
      .sort();
    expect(tests).toEqual([assetId(1), assetId(4), assetId(5)]);
    expect(testOrder(4).description).toMatch(
      /^Electrical safety test \(IS\/IEC 62353\) due /,
    );
    expect(
      store.orders.some(
        (o) => o.assetId === assetId(4) && o.workOrderType === 'CALIBRATION',
      ),
    ).toBe(true);
    expect(store.notifications.map((n) => n.kind)).toContain('safety_test_due');

    // Running again opens nothing new.
    const before = store.orders.length;
    await openSchedule();
    expect(store.orders.length).toBe(before);
  });

  describe('completing a safety test work order', () => {
    beforeEach(openSchedule);

    it('needs the readings the device class calls for, and the analyser', async () => {
      const order = testOrder(1);
      const none = await complete(order.id, {}).expect(400);
      expect(none.body.message).toMatch(/Record the safety test readings/);

      const missing = await complete(order.id, {
        safetyTest: readings({
          earthResistanceOhm: undefined,
          appliedPartLeakageUa: undefined,
        }),
      }).expect(400);
      expect(missing.body.message).toEqual([
        'Enter the protective earth resistance',
        'Enter the applied part leakage current',
      ]);

      const noAnalyser = await complete(order.id, {
        safetyTest: readings({ analyzer: '' }),
      }).expect(400);
      expect(JSON.stringify(noAnalyser.body.message)).toMatch(
        /Say which safety analyser was used/,
      );

      const outside = await complete(order.id, {
        safetyTest: readings({ provider: 'VENDOR' }),
      }).expect(400);
      expect(outside.body.message).toEqual(['Name the manufacturer or vendor']);

      expect(store.safetyTests).toHaveLength(0);
      expect(order.workOrderStatus).toBe('PENDING');
    });

    it('works out pass or fail itself: a result sent with the readings is refused', async () => {
      const res = await complete(testOrder(1).id, {
        safetyTest: { ...readings(), passed: true },
      }).expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(
        /property passed should not exist/,
      );
    });

    it('records a pass, with each reading against its limit, and sets the next due date', async () => {
      const order = testOrder(1);
      const body = readings();
      await complete(order.id, { safetyTest: body }).expect(200);

      expect(order.workOrderStatus).toBe('COMPLETED');
      expect(store.safetyTests).toHaveLength(1);
      const [record] = store.safetyTests;
      expect(record).toMatchObject({
        assetId: assetId(1),
        workOrderId: order.id,
        provider: 'IN_HOUSE',
        providerName: null,
        analyzer: 'Rigel 288+, SN 12345, calibrated 2026-04',
        passed: true,
        recordedById: 'user-technician',
      });
      expect(
        record.checks.map((c: Record<string, unknown>) => [
          c.key,
          c.limit,
          c.passed,
        ]),
      ).toEqual([
        ['visualInspection', null, true],
        ['functionalTest', null, true],
        ['earthResistance', 0.3, true],
        ['insulationMains', 2, true],
        // Optional and not measured.
        ['insulationApplied', 70, null],
        ['equipmentLeakage', 500, true],
        ['appliedPartLeakage', 5000, true],
      ]);

      const d = device(1);
      expect(d.lastSafetyTestPassed).toBe(true);
      expect(d.lastSafetyInspectionDate).toEqual(new Date(body.testedAt));
      expect(d.nextSafetyInspectionDue).toEqual(
        new Date(new Date(body.testedAt).getTime() + 365 * DAY),
      );
      // The class and applied parts are learnt from the first test.
      expect(d).toMatchObject({
        electricalClass: 'CLASS_I',
        appliedPartType: 'BF',
      });
    });

    it("uses the device's own interval, and keeps the class it already has", async () => {
      const testedAt = new Date(now.getTime() - 2 * DAY);
      await complete(testOrder(5).id, {
        safetyTest: readings({
          testedAt: testedAt.toISOString(),
          electricalClass: 'CLASS_II',
          appliedPartType: 'CF',
          earthResistanceOhm: undefined,
          equipmentLeakageUa: 40,
          appliedPartLeakageUa: 9,
        }),
      }).expect(200);
      const d = device(5);
      expect(d.nextSafetyInspectionDue).toEqual(
        new Date(testedAt.getTime() + 180 * DAY),
      );
      expect(d.appliedPartType).toBe('CF');
    });

    it('takes readings only when the test is being completed', async () => {
      const res = await complete(testOrder(1).id, {
        status: 'IN_PROGRESS',
        safetyTest: readings(),
      }).expect(400);
      expect(res.body.message).toMatch(/only be recorded when completing/);
      expect(store.safetyTests).toHaveLength(0);
    });
  });

  it('a failed test takes the device out of use until a passing test is recorded', async () => {
    await openSchedule();
    const order = testOrder(1);
    await complete(order.id, {
      safetyTest: readings({ earthResistanceOhm: 0.45 }),
    }).expect(200);

    const d = device(1);
    expect(store.safetyTests[0].passed).toBe(false);
    expect(d.assetStatus).toBe('QUARANTINED');
    expect(d.lastSafetyTestPassed).toBe(false);
    // Due again at once: it needs retesting after repair.
    expect(d.nextSafetyInspectionDue).toEqual(store.safetyTests[0].testedAt);
    expect(store.statusChanges.at(-1)).toMatchObject({
      toStatus: 'QUARANTINED',
      source: 'WORK_ORDER',
      workOrderId: order.id,
      reason:
        'Failed electrical safety test: Protective earth resistance 0.45 Ω is above the 0.3 Ω limit',
    });
    expect(
      store.notifications.some((n) => n.kind === 'safety_test_failed'),
    ).toBe(true);

    // Nobody can put it back into use from the device page.
    const release = await http()
      .post(`/api/assets/${assetId(1)}/status`)
      .set(bearer('engineer'))
      .send({
        status: 'ACTIVE',
        expectedStatus: 'QUARANTINED',
        reason: 'Replaced the power cord',
        confirmSafe: true,
      })
      .expect(400);
    expect(release.body.message).toMatch(
      /failed its last electrical safety test/,
    );
    expect(d.assetStatus).toBe('QUARANTINED');

    // The schedule opens the retest; a pass lets it be released.
    await openSchedule();
    await complete(testOrder(1).id, {
      safetyTest: readings({ reason: 'AFTER_REPAIR' }),
      releaseDevice: true,
      confirmSafe: true,
    }).expect(200);
    expect(d.assetStatus).toBe('ACTIVE');
    expect(d.lastSafetyTestPassed).toBe(true);
  });

  it('cancels the retest when a reading entered wrongly is corrected to a pass', async () => {
    await openSchedule();
    const done = await complete(testOrder(1).id, {
      safetyTest: readings({ earthResistanceOhm: 1.2 }),
    }).expect(200);
    const failed = store.safetyTests[0];
    expect(done.body.record).toEqual({ type: 'safetyTest', id: failed.id });

    await openSchedule();
    const retest = testOrder(1);
    expect(retest.dueDate).toEqual(failed.testedAt);
    // Someone else's retest already under way is not touched.
    const started = {
      ...retest,
      id: 'started',
      workOrderStatus: 'IN_PROGRESS',
      dueDate: new Date(0),
    };
    store.orders.push(started);

    await http()
      .post(`/api/safety-tests/${failed.id}/corrections`)
      .set(tech)
      .send({
        ...readings({ earthResistanceOhm: 0.12 }),
        correctionReason: 'Typed 1.2 for 0.12 Ω',
      })
      .expect(201);
    expect(retest).toMatchObject({
      workOrderStatus: 'CANCELLED',
      workPerformed: expect.stringMatching(
        /^Cancelled: the safety test record was corrected/,
      ),
    });
    expect(started.workOrderStatus).toBe('IN_PROGRESS');
    expect(device(1).lastSafetyTestPassed).toBe(true);
  });

  describe('records without a work order, and corrections', () => {
    it('records a test done after a repair and puts the device in the programme', async () => {
      const res = await http()
        .post(`/api/assets/${assetId(3)}/safety-tests`)
        .set(tech)
        .send(
          readings({
            reason: 'AFTER_REPAIR',
            provider: 'VENDOR',
            providerName: 'Philips service',
          }),
        )
        .expect(201);
      expect(res.body).toMatchObject({
        reason: 'AFTER_REPAIR',
        providerName: 'Philips service',
        passed: true,
        recordedBy: 'Tara Tech',
        correctedBy: null,
      });
      expect(device(3).requiresSafetyTest).toBe(true);
    });

    it('sends you to the open work order instead of recording twice', async () => {
      await openSchedule();
      const res = await http()
        .post(`/api/assets/${assetId(1)}/safety-tests`)
        .set(tech)
        .send(readings())
        .expect(409);
      expect(res.body.message).toMatch(/open electrical safety test/);
    });

    it('corrects a record by replacing it, keeping the original and the reason', async () => {
      // 0.045 Ω typed as 4.5: a fail that should have been a pass.
      const first = await http()
        .post(`/api/assets/${assetId(2)}/safety-tests`)
        .set(tech)
        .send(readings({ earthResistanceOhm: 4.5 }))
        .expect(201);
      expect(first.body.passed).toBe(false);
      expect(device(2).assetStatus).toBe('QUARANTINED');

      const short = await http()
        .post(`/api/safety-tests/${first.body.id}/corrections`)
        .set(tech)
        .send({ ...readings(), correctionReason: 'typo' })
        .expect(400);
      expect(JSON.stringify(short.body.message)).toMatch(/why the record/);

      const corrected = await http()
        .post(`/api/safety-tests/${first.body.id}/corrections`)
        .set(tech)
        .send({
          ...readings({ earthResistanceOhm: 0.045 }),
          correctionReason: 'Earth resistance was 0.045 Ω, typed as 4.5',
        })
        .expect(201);
      expect(corrected.body).toMatchObject({
        supersedesId: first.body.id,
        passed: true,
        correctionReason: 'Earth resistance was 0.045 Ω, typed as 4.5',
      });
      // The device can now be released, by a person, from its page.
      expect(device(2).lastSafetyTestPassed).toBe(true);
      expect(device(2).assetStatus).toBe('QUARANTINED');

      const list = await http()
        .get(`/api/assets/${assetId(2)}/safety-tests`)
        .set(bearer('clinical_staff'))
        .expect(200);
      expect(list.body).toHaveLength(2);
      expect(
        list.body.find((r: { id: string }) => r.id === first.body.id),
      ).toMatchObject({ correctedBy: corrected.body.id, passed: false });

      // Only the latest version can be corrected.
      await http()
        .post(`/api/safety-tests/${first.body.id}/corrections`)
        .set(tech)
        .send({
          ...readings(),
          correctionReason: 'Second attempt at the same record',
        })
        .expect(409);
    });

    it('is for biomed to write, any staff to read, and only in their own organization', async () => {
      await http()
        .post(`/api/assets/${assetId(2)}/safety-tests`)
        .set(bearer('clinical_staff'))
        .send(readings())
        .expect(403);
      await http()
        .get(`/api/assets/${assetId(2)}/safety-tests`)
        .set(bearer('technician', ORG_B))
        .expect(404);
      await http()
        .post(`/api/assets/${assetId(2)}/safety-tests`)
        .set(bearer('technician', ORG_B))
        .send(readings())
        .expect(404);
    });
  });

  it('putting a device in the programme without a due date makes a test due now', async () => {
    const before = Date.now();
    await http()
      .patch(`/api/assets/${assetId(3)}`)
      .set(bearer('admin'))
      .send({
        requiresSafetyTest: true,
        electricalClass: 'CLASS_II',
        appliedPartType: 'B',
      })
      .expect(200);
    const d = device(3);
    // It had a date, so that one stands.
    expect(d.nextSafetyInspectionDue).toEqual(ahead(1));

    d.requiresSafetyTest = false;
    d.nextSafetyInspectionDue = null;
    await http()
      .patch(`/api/assets/${assetId(3)}`)
      .set(bearer('admin'))
      .send({ requiresSafetyTest: true, safetyTestFrequencyDays: 180 })
      .expect(200);
    expect(d.nextSafetyInspectionDue.getTime()).toBeGreaterThanOrEqual(before);
    expect(d.nextSafetyInspectionDue.getTime()).toBeLessThanOrEqual(Date.now());
    expect(d).toMatchObject({
      requiresSafetyTest: true,
      safetyTestFrequencyDays: 180,
      electricalClass: 'CLASS_II',
      appliedPartType: 'B',
    });
  });

  it('shows safety test compliance on the dashboard', async () => {
    store.assets.push(
      asset(6, { requiresSafetyTest: true, nextSafetyInspectionDue: null }),
      // Failed today: not yet overdue, but not compliant either.
      asset(7, {
        requiresSafetyTest: true,
        nextSafetyInspectionDue: ahead(0.5),
        lastSafetyTestPassed: false,
        assetStatus: 'QUARANTINED',
      }),
    );
    const res = await http()
      .get('/api/dashboard')
      .set(bearer('engineer'))
      .expect(200);
    // Scheduled: 1, 2, 4, 5, 7. Overdue: 5. Due within 30 days: 1, 4, 7.
    // Not compliant: 5 (overdue) and 7 (failed).
    expect(res.body.safetyTests).toEqual({
      scheduled: 5,
      overdue: 1,
      dueSoon: 3,
      dueSoonDays: 30,
      notScheduled: 1,
      failed: 1,
      compliancePercent: 60,
    });
  });
});
