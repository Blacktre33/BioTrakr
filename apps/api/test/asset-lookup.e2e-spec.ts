import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { bearer, createTestApp, ORG_A, ORG_B } from './helpers';

const ID = '11111111-1111-4111-8111-111111111111';

const device = {
  id: ID,
  assetTagNumber: 'VENT-7',
  equipmentName: 'ICU ventilator',
  manufacturer: 'Dräger',
  modelNumber: 'V500',
  serialNumber: 'SN1',
  deviceCategory: 'LIFE_SUPPORT',
  criticalityLevel: 'CRITICAL',
  riskClassification: 'CLASS_III',
  assetStatus: 'QUARANTINED',
  recallStatus: 'NONE',
  lastPmDate: new Date('2026-07-01T00:00:00Z'),
  nextPmDueDate: new Date('2099-01-01T00:00:00Z'),
  lastSeenTimestamp: null,
  currentFacility: { facilityName: 'City General' },
  currentRoom: { roomName: 'ICU Bay 3', roomCode: 'ICU-3' },
  custodianDepartment: { departmentName: 'ICU' },
  maintenanceHistory: [],
  statusChanges: [
    {
      id: 'c1',
      fromStatus: 'ACTIVE',
      toStatus: 'QUARANTINED',
      reason: 'Critical fault E42 (needs intervention)',
      source: 'DEVICE_ALERT',
      changedAt: new Date('2026-10-07T08:00:00Z'),
      changedBy: null,
    },
  ],
  scanLogs: [
    {
      id: 's1',
      createdAt: new Date('2026-10-07T09:00:00Z'),
      notes: null,
      locationHint: 'Bay 3',
      scannedBy: { firstName: 'Nia', lastName: 'Nurse' },
    },
  ],
};

describe('Asset lookup by scan (e2e)', () => {
  let app: INestApplication;
  // A second device whose tag differs only in case: "Vent-8" vs "VENT-8".
  const twins = [
    {
      ...device,
      id: 'twin-1',
      assetTagNumber: 'VENT-8',
      assetStatus: 'ACTIVE',
    },
    { ...device, id: 'twin-2', assetTagNumber: 'Vent-8' },
  ];
  const findMany = jest.fn(
    async ({ where }: { where: Record<string, unknown> }) => {
      if (where.organizationId !== ORG_A || where.deletedAt !== null) {
        return [];
      }
      const tag = where.assetTagNumber as
        | { equals: string; mode: string }
        | undefined;
      if (where.id === ID) return [device];
      if (tag?.mode !== 'insensitive') return [];
      return [device, ...twins].filter(
        (d) => d.assetTagNumber.toUpperCase() === tag.equals.toUpperCase(),
      );
    },
  );

  beforeAll(async () => {
    app = await createTestApp({ asset: { findMany } });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => findMany.mockClear());

  const lookup = (
    code: string,
    role: 'clinical_staff' | 'viewer' = 'clinical_staff',
    org = ORG_A,
  ) =>
    request(app.getHttpServer())
      .get('/api/assets/lookup')
      .query({ code })
      .set(bearer(role, org));

  it('finds a device by the tag printed on it, ignoring case', async () => {
    const { body } = await lookup('vent-7').expect(200);

    expect(body).toMatchObject({
      id: ID,
      assetTagNumber: 'VENT-7',
      safeToUse: false,
      alerts: [
        { level: 'stop', message: 'Quarantined. Do not use on patients.' },
      ],
      location: { facility: 'City General', room: 'ICU Bay 3 (ICU-3)' },
      department: 'ICU',
      pm: { overdue: false },
      recentScans: [
        { id: 's1', scannedBy: 'Nia Nurse', locationHint: 'Bay 3' },
      ],
      recentStatusChanges: [
        { toStatus: 'QUARANTINED', source: 'DEVICE_ALERT', changedBy: null },
      ],
    });
    // Internal relation objects are flattened, not passed through.
    expect(body).not.toHaveProperty('scanLogs');
    expect(body).not.toHaveProperty('currentRoom');
  });

  it('finds a device from its QR payload or a scan link', async () => {
    await lookup(`biotrakr://asset/${ID}`).expect(200);
    await lookup(`https://biotrakr.example/scan?code=VENT-7`).expect(200);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_A,
          deletedAt: null,
        }),
      }),
    );
  });

  it("does not reveal another organization's devices", async () => {
    const res = await lookup('VENT-7', 'clinical_staff', ORG_B).expect(404);
    expect(res.body.message).toMatch(
      /No device with tag "VENT-7" in your organization/,
    );
  });

  it('explains an empty or foreign code instead of failing', async () => {
    await lookup('').expect(400);
    const res = await lookup('https://example.com/menu').expect(400);
    expect(res.body.message).toMatch(/not a BioTrakr asset label/);
  });

  it('never guesses between tags that differ only in case', async () => {
    // Exact spelling wins.
    const exact = await lookup('Vent-8').expect(200);
    expect(exact.body.id).toBe('twin-2');
    // Otherwise refuse rather than risk showing the wrong device as safe.
    const res = await lookup('vent-8').expect(409);
    expect(res.body.message).toMatch(/More than one device/);
  });

  it('is not mistaken for an asset id route', async () => {
    await lookup('VENT-7', 'viewer').expect(200);
  });
});
