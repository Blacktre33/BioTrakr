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

/** A certificate from a NABL-accredited laboratory, as BioTrakr expects it. */
const labCertificate = (over: Record<string, unknown> = {}) => ({
  calibratedAt: new Date(Date.now() - DAY).toISOString(),
  provider: 'EXTERNAL_LAB',
  providerName: 'Precise Calibration Labs',
  labAccreditationNumber: 'CC-2345',
  certificateNumber: 'PCL/2026/0412',
  validUntil: new Date(Date.now() + 364 * DAY).toISOString(),
  measurementUncertainty: '±0.5 mmHg (k=2)',
  result: 'PASS',
  ...over,
});

describe('Calibration (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const now = new Date();
  const ahead = (days: number) => new Date(now.getTime() + days * DAY);
  const tech = bearer('technician');
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    delete process.env.PM_LEAD_DAYS;
    store = buildStore();
    store.assets.push(
      asset(1, { requiresCalibration: true, nextCalibrationDue: ahead(5) }),
      asset(2, { requiresCalibration: true, nextCalibrationDue: ahead(40) }),
      asset(3, { requiresCalibration: false, nextCalibrationDue: ahead(1) }),
      // PM and calibration due the same day: both open.
      asset(4, {
        requiresCalibration: true,
        nextCalibrationDue: ahead(2),
        nextPmDueDate: ahead(2),
      }),
      asset(5, {
        requiresCalibration: true,
        nextCalibrationDue: ahead(-3),
        calibrationFrequencyDays: 180,
      }),
    );
    app = await createTestApp(store);
  });
  afterEach(async () => {
    await app.close();
  });

  const openSchedule = () => app.get(PmJobsService).openDue(now);
  const calibrationOrder = (n: number) =>
    store.orders.find(
      (o) => o.assetId === assetId(n) && o.workOrderType === 'CALIBRATION',
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
        workPerformed: 'Calibrated against reference',
        ...body,
      });

  describe('the schedule', () => {
    it('opens calibration work orders ahead of the due date, next to PM ones', async () => {
      await openSchedule();
      const calibration = store.orders
        .filter((o) => o.workOrderType === 'CALIBRATION')
        .map((o) => o.assetId)
        .sort();
      expect(calibration).toEqual([assetId(1), assetId(4), assetId(5)]);
      expect(calibrationOrder(4).description).toMatch(/^Calibration due /);
      expect(
        store.orders.some(
          (o) =>
            o.assetId === assetId(4) &&
            o.workOrderType === 'PREVENTIVE_MAINTENANCE',
        ),
      ).toBe(true);
      expect(store.notifications.map((n) => n.kind)).toContain(
        'calibration_due',
      );

      // Running again opens nothing new.
      const before = store.orders.length;
      await openSchedule();
      expect(store.orders.length).toBe(before);
    });
  });

  describe('completing a calibration work order', () => {
    beforeEach(openSchedule);

    it('needs the result, and the certificate details an outside lab must give', async () => {
      const order = calibrationOrder(1);
      const missing = await complete(order.id, {}).expect(400);
      expect(missing.body.message).toMatch(/Record the calibration result/);

      const incomplete = await complete(order.id, {
        calibration: labCertificate({
          labAccreditationNumber: '',
          measurementUncertainty: undefined,
        }),
      }).expect(400);
      expect(incomplete.body.message).toEqual(
        expect.arrayContaining([
          "Enter the laboratory's NABL accreditation number",
          'Enter the measurement uncertainty stated on the certificate',
        ]),
      );
      expect(store.calibrations).toHaveLength(0);
      expect(order.workOrderStatus).toBe('PENDING');
    });

    it('records the certificate and moves the next due date to its expiry', async () => {
      const order = calibrationOrder(1);
      const cert = labCertificate();
      await complete(order.id, { calibration: cert }).expect(200);

      expect(order.workOrderStatus).toBe('COMPLETED');
      expect(store.calibrations).toHaveLength(1);
      expect(store.calibrations[0]).toMatchObject({
        assetId: assetId(1),
        workOrderId: order.id,
        provider: 'EXTERNAL_LAB',
        labAccreditationNumber: 'CC-2345',
        measurementUncertainty: '±0.5 mmHg (k=2)',
        result: 'PASS',
        recordedById: 'user-technician',
      });
      const device = store.assets.find((a) => a.id === assetId(1))!;
      expect(device.lastCalibrationResult).toBe('PASS');
      expect(device.nextCalibrationDue).toEqual(new Date(cert.validUntil));
    });

    it('in-house work must name its reference; without a certificate date the interval applies', async () => {
      const order = calibrationOrder(5);
      const bad = await complete(order.id, {
        calibration: { ...labCertificate(), provider: 'IN_HOUSE' },
      }).expect(400);
      expect(bad.body.message).toEqual([
        'Say which reference equipment was used, and its own calibration',
      ]);

      const calibratedAt = new Date(now.getTime() - 2 * DAY);
      await complete(order.id, {
        calibration: {
          calibratedAt: calibratedAt.toISOString(),
          provider: 'IN_HOUSE',
          referenceStandards: 'Fluke ProSim 8, SN 1234, calibrated 2026-03',
          result: 'ADJUSTED',
        },
      }).expect(200);
      const device = store.assets.find((a) => a.id === assetId(5))!;
      expect(device.nextCalibrationDue).toEqual(
        new Date(calibratedAt.getTime() + 180 * DAY),
      );
      expect(device.lastCalibrationResult).toBe('ADJUSTED');
    });

    it('refuses a calibration result on other work', async () => {
      await openSchedule();
      const pm = store.orders.find(
        (o) => o.workOrderType === 'PREVENTIVE_MAINTENANCE',
      )!;
      const res = await complete(pm.id, {
        calibration: labCertificate(),
      }).expect(400);
      expect(res.body.message).toMatch(/only be recorded when completing/);
    });
  });

  describe('a failed calibration', () => {
    beforeEach(openSchedule);

    it('takes the device out of use until a passing calibration is recorded', async () => {
      const order = calibrationOrder(1);
      const failed = await complete(order.id, {
        calibration: labCertificate({ result: 'FAIL' }),
      }).expect(400);
      expect(failed.body.message).toEqual(['Say what was out of tolerance']);

      await complete(order.id, {
        calibration: labCertificate({
          result: 'FAIL',
          notes: 'Pressure reads 8 mmHg high at 200 mmHg',
          validUntil: undefined,
        }),
      }).expect(200);

      const device = store.assets.find((a) => a.id === assetId(1))!;
      expect(device.assetStatus).toBe('QUARANTINED');
      expect(device.lastCalibrationResult).toBe('FAIL');
      // Due again at once: it needs recalibrating after repair.
      expect(device.nextCalibrationDue).toEqual(
        store.calibrations[0].calibratedAt,
      );
      expect(store.statusChanges.at(-1)).toMatchObject({
        toStatus: 'QUARANTINED',
        source: 'WORK_ORDER',
        workOrderId: order.id,
        reason: 'Failed calibration: Pressure reads 8 mmHg high at 200 mmHg',
      });
      expect(
        store.notifications.some((n) => n.kind === 'calibration_failed'),
      ).toBe(true);

      // Nobody can put it back into use from the device page.
      const release = await http()
        .post(`/api/assets/${assetId(1)}/status`)
        .set(bearer('engineer'))
        .send({
          status: 'ACTIVE',
          expectedStatus: 'QUARANTINED',
          reason: 'Repaired the pressure sensor',
          confirmSafe: true,
        })
        .expect(400);
      expect(release.body.message).toMatch(/failed its last calibration/);
      expect(device.assetStatus).toBe('QUARANTINED');

      // The schedule opens the recalibration; a pass lets it be released.
      await openSchedule();
      const again = store.orders.find(
        (o) =>
          o.assetId === assetId(1) &&
          o.workOrderType === 'CALIBRATION' &&
          o.workOrderStatus === 'PENDING',
      )!;
      await complete(again.id, {
        calibration: labCertificate({ certificateNumber: 'PCL/2026/0413' }),
        releaseDevice: true,
        confirmSafe: true,
      }).expect(200);
      expect(device.assetStatus).toBe('ACTIVE');
      expect(device.lastCalibrationResult).toBe('PASS');
    });
  });

  describe('records without a work order, and corrections', () => {
    it('records an existing certificate and puts the device in the programme', async () => {
      const res = await http()
        .post(`/api/assets/${assetId(2)}/calibrations`)
        .set(tech)
        .send(labCertificate())
        .expect(201);
      expect(res.body).toMatchObject({
        provider: 'EXTERNAL_LAB',
        recordedBy: 'Tara Tech',
        correctedBy: null,
      });

      store.assets.find((a) => a.id === assetId(3))!.requiresCalibration =
        false;
      await http()
        .post(`/api/assets/${assetId(3)}/calibrations`)
        .set(tech)
        .send(labCertificate())
        .expect(201);
      expect(
        store.assets.find((a) => a.id === assetId(3))!.requiresCalibration,
      ).toBe(true);
    });

    it('sends you to the open work order instead of recording twice', async () => {
      await openSchedule();
      const res = await http()
        .post(`/api/assets/${assetId(1)}/calibrations`)
        .set(tech)
        .send(labCertificate())
        .expect(409);
      expect(res.body.message).toMatch(/open calibration work order/);
    });

    it('never lets an older certificate move the dates backwards', async () => {
      await http()
        .post(`/api/assets/${assetId(2)}/calibrations`)
        .set(tech)
        .send(labCertificate())
        .expect(201);
      const due = store.assets.find(
        (a) => a.id === assetId(2),
      )!.nextCalibrationDue;
      await http()
        .post(`/api/assets/${assetId(2)}/calibrations`)
        .set(tech)
        .send(
          labCertificate({
            calibratedAt: new Date(now.getTime() - 400 * DAY).toISOString(),
            validUntil: new Date(now.getTime() - 35 * DAY).toISOString(),
            certificateNumber: 'PCL/2025/0001',
          }),
        )
        .expect(201);
      expect(
        store.assets.find((a) => a.id === assetId(2))!.nextCalibrationDue,
      ).toEqual(due);
    });

    it('corrects a record by replacing it, keeping the original and the reason', async () => {
      const first = await http()
        .post(`/api/assets/${assetId(2)}/calibrations`)
        .set(tech)
        .send(labCertificate({ validUntil: ahead(30).toISOString() }))
        .expect(201);

      const short = await http()
        .post(`/api/calibrations/${first.body.id}/corrections`)
        .set(tech)
        .send({ ...labCertificate(), correctionReason: 'typo' })
        .expect(400);
      expect(JSON.stringify(short.body.message)).toMatch(/why the record/);

      const fixed = ahead(200);
      const corrected = await http()
        .post(`/api/calibrations/${first.body.id}/corrections`)
        .set(tech)
        .send({
          ...labCertificate({ validUntil: fixed.toISOString() }),
          correctionReason: 'Valid-until date was misread from the certificate',
        })
        .expect(201);
      expect(corrected.body).toMatchObject({
        supersedesId: first.body.id,
        correctionReason: 'Valid-until date was misread from the certificate',
      });
      expect(
        store.assets.find((a) => a.id === assetId(2))!.nextCalibrationDue,
      ).toEqual(fixed);

      const list = await http()
        .get(`/api/assets/${assetId(2)}/calibrations`)
        .set(bearer('clinical_staff'))
        .expect(200);
      expect(list.body).toHaveLength(2);
      expect(
        list.body.find((r: { id: string }) => r.id === first.body.id),
      ).toMatchObject({ correctedBy: corrected.body.id });

      // Only the latest version can be corrected.
      await http()
        .post(`/api/calibrations/${first.body.id}/corrections`)
        .set(tech)
        .send({
          ...labCertificate(),
          correctionReason: 'Second attempt at the same record',
        })
        .expect(409);
    });

    it('is for biomed to write, any staff to read, and only in their own organization', async () => {
      await http()
        .post(`/api/assets/${assetId(2)}/calibrations`)
        .set(bearer('clinical_staff'))
        .send(labCertificate())
        .expect(403);
      await http()
        .get(`/api/assets/${assetId(2)}/calibrations`)
        .set(bearer('technician', ORG_B))
        .expect(404);
      await http()
        .post(`/api/assets/${assetId(2)}/calibrations`)
        .set(bearer('technician', ORG_B))
        .send(labCertificate())
        .expect(404);
    });
  });

  it('shows calibration compliance on the dashboard', async () => {
    store.assets.push(
      asset(6, { requiresCalibration: true, nextCalibrationDue: null }),
      // Failed today: not yet overdue, but not compliant either.
      asset(7, {
        requiresCalibration: true,
        nextCalibrationDue: ahead(0.5),
        lastCalibrationResult: 'FAIL',
        assetStatus: 'QUARANTINED',
      }),
    );
    const res = await http()
      .get('/api/dashboard')
      .set(bearer('engineer'))
      .expect(200);
    // Scheduled: 1, 2, 4, 5, 7. Overdue: 5. Due within 30 days: 1, 4, 7.
    // Not compliant: 5 (overdue) and 7 (failed).
    expect(res.body.calibration).toEqual({
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
