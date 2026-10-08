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
  const findFirst = jest.fn(
    async ({ where }: { where: Record<string, unknown> }) => {
      if (where.organizationId !== ORG_A || where.deletedAt !== null) {
        return null;
      }
      const tag = where.assetTagNumber as
        | { equals: string; mode: string }
        | undefined;
      if (where.id === ID) return device;
      if (
        tag?.mode === 'insensitive' &&
        tag.equals.toUpperCase() === 'VENT-7'
      ) {
        return device;
      }
      return null;
    },
  );

  beforeAll(async () => {
    app = await createTestApp({ asset: { findFirst } });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => findFirst.mockClear());

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
    });
    // Internal relation objects are flattened, not passed through.
    expect(body).not.toHaveProperty('scanLogs');
    expect(body).not.toHaveProperty('currentRoom');
  });

  it('finds a device from its QR payload or a scan link', async () => {
    await lookup(`biotrakr://asset/${ID}`).expect(200);
    await lookup(`https://biotrakr.example/scan?code=VENT-7`).expect(200);
    expect(findFirst).toHaveBeenLastCalledWith(
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

  it('is not mistaken for an asset id route', async () => {
    await lookup('VENT-7', 'viewer').expect(200);
  });
});
