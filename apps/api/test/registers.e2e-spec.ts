import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  asset,
  assetId,
  buildStore,
  DAY,
  FAC_2,
  type DeviceStore,
} from './device-store';
import { bearer, createTestApp, ORG_A, ORG_B } from './helpers';

describe('Registers (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const http = () => request(app.getHttpServer());
  const get = (path: string, headers = bearer('engineer')) =>
    http().get(`/api/registers/${path}`).set(headers);
  const ago = (days: number) => new Date(Date.now() - days * DAY);
  /** The rows as label → value, as a reader sees them. */
  const read = (body: {
    columns: Array<{ key: string; label: string }>;
    rows: Array<Record<string, unknown>>;
  }) =>
    body.rows.map((r) =>
      Object.fromEntries(body.columns.map((c) => [c.label, r[c.key]])),
    );

  beforeEach(async () => {
    store = buildStore();
    store.assets.push(
      asset(1, {
        equipmentName: 'Syringe pump',
        manufacturer: 'BD',
        modelNumber: 'Alaris GH',
        serialNumber: 'SN-1',
        purchaseDate: new Date('2024-04-01T06:30:00Z'),
        installationDate: new Date('2024-04-15T06:30:00Z'),
        warrantyEndDate: new Date('2026-04-14T06:30:00Z'),
        departmentName: 'ICU',
      }),
      asset(2, {
        equipmentName: 'syringe pump ',
        manufacturer: 'BD',
        modelNumber: 'Alaris GH',
        serialNumber: 'SN-2',
        purchaseDate: new Date('2024-04-01T06:30:00Z'),
        assetStatus: 'QUARANTINED',
        departmentName: 'ICU',
      }),
      asset(3, {
        equipmentName: 'Defibrillator',
        manufacturer: 'Philips',
        modelNumber: 'HeartStart',
        serialNumber: null,
        purchaseDate: new Date('2023-01-10T06:30:00Z'),
        assetStatus: 'CONDEMNED',
        departmentName: 'Emergency',
        currentFacilityId: FAC_2,
      }),
      asset(4, { assetStatus: 'DISPOSED', purchaseDate: new Date() }),
      asset(9, { organizationId: ORG_B, purchaseDate: new Date() }),
    );
    store.vendors.push({
      id: 'v1',
      organizationId: ORG_A,
      vendorName: 'BD India',
      phone: '1800 100 200',
    });
    store.contracts.push({
      id: 'c0000000-0000-4000-8000-000000000001',
      organizationId: ORG_A,
      vendorId: 'v1',
      contractType: 'CMC',
      contractNumber: 'BD/CMC/26',
      startDate: ago(30),
      endDate: new Date(Date.now() + 300 * DAY),
      annualValue: 48000,
      responseTimeHours: 24,
      pmVisitsPerYear: 2,
      terminatedAt: null,
      terminationReason: null,
    });
    store.contractAssets.push(
      {
        contractId: 'c0000000-0000-4000-8000-000000000001',
        assetId: assetId(1),
      },
      {
        contractId: 'c0000000-0000-4000-8000-000000000001',
        assetId: assetId(2),
      },
    );
    app = await createTestApp(store);
  });
  afterEach(async () => {
    await app.close();
  });

  it('prints the inventory master record in the NHSRC Annexure F columns', async () => {
    const res = await get('inventory').expect(200);
    expect(res.body).toMatchObject({
      title: 'Inventory Master Record',
      basis: expect.stringMatching(/Annexure F/),
      organization: 'City General Hospital',
      facility: null,
      period: null,
      truncated: false,
    });
    expect(res.body.columns.map((c: { label: string }) => c.label)).toEqual([
      'Sl. No.',
      'Ref ID',
      'Equipment Nomenclature',
      'Qty',
      'Make/model (Sl. Num)',
      'Location',
      'Date installed/received',
      'Warranty Valid Till',
      'CAMC/AMC Valid Till',
      'Current Status/Remarks',
    ]);
    const rows = read(res.body);
    // Disposed and other hospitals' devices are not listed.
    expect(rows.map((r) => r['Ref ID'])).toEqual(['TAG-1', 'TAG-2', 'TAG-3']);
    expect(rows[0]).toMatchObject({
      'Sl. No.': 1,
      'Make/model (Sl. Num)': 'BD Alaris GH (Sl. SN-1)',
      'Date installed/received': '15 Apr 2024',
      'Warranty Valid Till': '14 Apr 2026',
      'CAMC/AMC Valid Till': expect.stringMatching(/^CMC to /),
      'Current Status/Remarks': 'Functional',
    });
    expect(rows[2]['Current Status/Remarks']).toBe(
      'Condemned (beyond economical repair)',
    );

    const north = await get(`inventory?facilityId=${FAC_2}`).expect(200);
    expect(north.body.facility).toBe('North Clinic');
    expect(read(north.body).map((r) => r['Ref ID'])).toEqual(['TAG-3']);
  });

  it('counts the annual survey by department and equipment (Annexure D)', async () => {
    const res = await get('survey').expect(200);
    expect(read(res.body)).toEqual([
      {
        'Sl. No.': 1,
        Department: 'Emergency',
        'Equipment Nomenclature': 'Defibrillator',
        'Quantity Held (Total)': 1,
        Functional: 0,
        'Non-Functional': 1,
        Repairable: 0,
        BER: 1,
        Remarks: null,
      },
      {
        'Sl. No.': 2,
        Department: 'ICU',
        // Names that differ only in case and spaces are one line.
        'Equipment Nomenclature': 'Syringe pump',
        'Quantity Held (Total)': 2,
        Functional: 1,
        'Non-Functional': 1,
        Repairable: 1,
        BER: 0,
        Remarks: null,
      },
    ]);
  });

  it("keeps each device's logbook (Annexure E): checks, breakdowns and their downtime", async () => {
    const reported = ago(20);
    store.orders.push(
      {
        id: '00000000-0000-4000-8000-000000000101',
        assetId: assetId(1),
        workOrderType: 'CORRECTIVE_MAINTENANCE',
        workOrderStatus: 'COMPLETED',
        createdAt: reported,
        completedAt: new Date(reported.getTime() + 6.5 * 3600e3),
        description: 'Occlusion alarm at every start',
        workPerformed: 'Replaced pressure sensor',
        assignedTechnicianId: 'user-technician',
      },
      {
        id: '00000000-0000-4000-8000-000000000102',
        assetId: assetId(1),
        workOrderType: 'PREVENTIVE_MAINTENANCE',
        workOrderStatus: 'COMPLETED',
        createdAt: ago(40),
        completedAt: ago(38),
        workPerformed: 'PM per checklist',
        assignedTechnicianId: 'user-technician',
      },
      {
        id: '00000000-0000-4000-8000-000000000103',
        assetId: assetId(1),
        workOrderType: 'CORRECTIVE_MAINTENANCE',
        workOrderStatus: 'CANCELLED',
        createdAt: ago(10),
      },
      {
        id: '00000000-0000-4000-8000-000000000104',
        assetId: assetId(1),
        workOrderType: 'ELECTRICAL_SAFETY_TEST',
        workOrderStatus: 'COMPLETED',
        createdAt: ago(9),
        completedAt: ago(8),
        workPerformed: 'Tested with Fluke ESA615',
        assignedTechnicianId: 'user-technician',
      },
    );
    // Done on the work order: the result shows in the logbook.
    store.safetyTests.push({
      id: '5a000000-0000-4000-8000-000000000001',
      assetId: assetId(1),
      workOrderId: '00000000-0000-4000-8000-000000000104',
      testedAt: ago(8),
      passed: false,
      recordedById: 'user-technician',
      supersedesId: null,
    });
    store.calibrations.push({
      id: 'cc000000-0000-4000-8000-000000000001',
      assetId: assetId(1),
      workOrderId: null,
      calibratedAt: ago(30),
      result: 'PASS',
      provider: 'EXTERNAL_LAB',
      providerName: 'Precise Labs',
      certificateNumber: 'PL-77',
      recordedById: 'user-technician',
      supersedesId: null,
    });
    const missing = await get('logbook').expect(400);
    expect(missing.body.message).toBe('Choose the device for its logbook');

    const res = await get(`logbook?assetId=${assetId(1)}`).expect(200);
    expect(res.body.device).toMatch(
      /^TAG-1 · Syringe pump · BD Alaris GH \(Sl. SN-1\)/,
    );
    const rows = read(res.body);
    expect(rows).toHaveLength(4);
    expect(rows[0]['Preventive Maintenance/Calibration']).toMatch(
      /^PM done .* by Tara Tech$/,
    );
    expect(rows[3]).toMatchObject({
      'Preventive Maintenance/Calibration': expect.stringMatching(
        /^Electrical safety test done .* by Tara Tech, failed$/,
      ),
      'Remarks of Service Engineer': 'Tested with Fluke ESA615',
    });
    expect(rows[1]).toMatchObject({
      'Preventive Maintenance/Calibration': expect.stringMatching(
        /^Calibration .*, pass$/,
      ),
      'Remarks of Service Engineer':
        'Precise Labs, certificate PL-77, recorded by Tara Tech',
    });
    expect(rows[2]).toMatchObject({
      'Remarks of Service Engineer':
        'Occlusion alarm at every start — Replaced pressure sensor',
      'Rectified on (Date/Time) by Service Engineer':
        expect.stringMatching(/ by Tara Tech$/),
      'Total Breakdown Time': '6.5 h',
      'Remarks/Sign of HoD': null,
    });
    expect(
      res.body.columns.find((c: { key: string }) => c.key === 'hod'),
    ).toMatchObject({ blank: true });

    await get(`logbook?assetId=${assetId(9)}`).expect(404);
  });

  it('lists calibrations with their NABL details and whether the certificate is on file', async () => {
    store.calibrations.push(
      {
        id: 'cc000000-0000-4000-8000-000000000001',
        assetId: assetId(1),
        calibratedAt: ago(30),
        provider: 'EXTERNAL_LAB',
        providerName: 'Precise Labs',
        labAccreditationNumber: 'CC-2345',
        certificateNumber: 'PL-77',
        measurementUncertainty: '±0.5 mL/h (k=2)',
        validUntil: new Date(Date.now() + 335 * DAY),
        result: 'PASS',
        supersedesId: null,
      },
      // Corrected: only the correction is listed.
      {
        id: 'cc000000-0000-4000-8000-000000000002',
        assetId: assetId(2),
        calibratedAt: ago(20),
        provider: 'IN_HOUSE',
        referenceStandards: 'Fluke IDA-5',
        result: 'PASS',
        supersedesId: null,
      },
      {
        id: 'cc000000-0000-4000-8000-000000000003',
        assetId: assetId(2),
        calibratedAt: ago(20),
        provider: 'IN_HOUSE',
        referenceStandards: 'Fluke IDA-5, SN 4411',
        result: 'FAIL',
        supersedesId: 'cc000000-0000-4000-8000-000000000002',
      },
      // Outside the period.
      {
        id: 'cc000000-0000-4000-8000-000000000004',
        assetId: assetId(1),
        calibratedAt: ago(800),
        provider: 'IN_HOUSE',
        result: 'PASS',
        supersedesId: null,
      },
    );
    store.documents.push({
      id: 'd1',
      calibrationRecordId: 'cc000000-0000-4000-8000-000000000001',
    });
    const res = await get('calibration').expect(200);
    expect(res.body.period).toEqual({
      from: expect.any(String),
      to: expect.any(String),
    });
    const rows = read(res.body);
    expect(rows).toEqual([
      expect.objectContaining({
        Equipment: 'TAG-1 · Syringe pump',
        'Calibrated by': 'Precise Labs (external laboratory)',
        'NABL accreditation no.': 'CC-2345',
        'Certificate no.': 'PL-77',
        'Measurement uncertainty / reference': '±0.5 mL/h (k=2)',
        Result: 'Pass',
        'Certificate on file': 'Yes',
      }),
      expect.objectContaining({
        Equipment: 'TAG-2 · syringe pump ',
        'Calibrated by': 'In-house',
        'Measurement uncertainty / reference': 'Fluke IDA-5, SN 4411',
        Result: 'Fail (corrected record)',
        'Certificate on file': 'No',
      }),
    ]);

    const old = await get(
      `calibration?from=${ago(900).toISOString().slice(0, 10)}&to=${ago(700).toISOString().slice(0, 10)}`,
    ).expect(200);
    expect(old.body.rows).toHaveLength(1);
    await get('calibration?from=2026-05-01&to=2026-04-01').expect(400);
  });

  it('lists breakdowns with time to rectify, and contracts with their cover', async () => {
    store.orders.push({
      id: 'abcdef12-0000-4000-8000-000000000101',
      assetId: assetId(2),
      workOrderType: 'CORRECTIVE_MAINTENANCE',
      workOrderStatus: 'IN_PROGRESS',
      isEmergency: true,
      createdAt: ago(3),
      startedAt: ago(2.9),
      description: 'Screen blank',
      createdByUserId: 'user-clinical_staff',
      failureCategory: null,
    });
    const breakdowns = read((await get('breakdown').expect(200)).body);
    expect(breakdowns).toEqual([
      expect.objectContaining({
        'Complaint no.': 'ABCDEF12',
        'Reported (date/time)': expect.stringMatching(/\(urgent\)$/),
        'Problem reported': 'Screen blank',
        'Reported by': 'Nia Nurse',
        Downtime: expect.stringMatching(/^3(\.\d)? days so far$/),
        Status: 'Open',
      }),
    ]);

    const contracts = read((await get('contracts').expect(200)).body);
    expect(contracts).toEqual([
      expect.objectContaining({
        Vendor: 'BD India (1800 100 200)',
        Type: 'CMC',
        'Equipment covered': '2: TAG-1, TAG-2',
        'Cost per year': '₹48,000',
        'Response / PM visits': '24 h response, 2 PM a year',
        Status: 'In force',
        'Signed copy on file': 'No',
      }),
    ]);
  });

  it('is for biomed and auditors, within their own hospital', async () => {
    await get('inventory', bearer('clinical_staff')).expect(403);
    await get('inventory', bearer('viewer')).expect(200);
    await get('lapsed').expect(400);
    const other = await get('inventory', bearer('engineer', ORG_B)).expect(200);
    expect(read(other.body).map((r) => r['Ref ID'])).toEqual(['TAG-9']);
    await get(
      `inventory?facilityId=${FAC_2}`,
      bearer('engineer', ORG_B),
    ).expect(404);
  });
});
