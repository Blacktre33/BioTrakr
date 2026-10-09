import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';

import { createAccessToken } from '@biotrakr/utils';

import { MAX_FAILED_LOGINS } from '../src/auth/auth.service';
import { bearer, createTestApp, ORG_A, ORG_B } from './helpers';

const ASSET_A = '11111111-1111-4111-8111-111111111111';
const ASSET_B = '22222222-2222-4222-8222-222222222222';
const FACILITY_A = '33333333-3333-4333-8333-333333333333';
const ROOM_A = '66666666-6666-4666-8666-666666666666';
const ROOM_OF_ORG_B = '77777777-7777-4777-8777-777777777777';

function buildPrisma() {
  // Fresh rows per test, since soft-delete tests mutate them.
  const assets: Array<{
    id: string;
    organizationId: string;
    assetTagNumber: string;
    deletedAt: Date | null;
    deletedById?: string;
    pmFrequencyDays?: number | null;
    lastPmDate?: Date | null;
    nextPmDueDate?: Date | null;
    currentRoomId?: string | null;
    lastSeenTimestamp?: Date | null;
    assetStatus?: string;
    equipmentName?: string;
  }> = [
    {
      id: ASSET_A,
      organizationId: ORG_A,
      assetTagNumber: 'VENT-A',
      equipmentName: 'ICU ventilator',
      deletedAt: null,
      pmFrequencyDays: 30,
      lastPmDate: null,
      lastSeenTimestamp: null,
      assetStatus: 'ACTIVE',
    },
    {
      id: ASSET_B,
      organizationId: ORG_B,
      assetTagNumber: 'VENT-B',
      deletedAt: null,
    },
  ];
  const users = [
    {
      id: 'u-admin',
      organizationId: ORG_A,
      email: 'admin@a.test',
      passwordHash: bcrypt.hashSync('CorrectHorse1!', 10),
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'ADMIN', // legacy upper-case value, as written by the old seed
      isActive: true,
      failedLoginAttempts: 0,
      accountLockedUntil: null as Date | null,
    },
  ];

  // Enough of Prisma's `where` for these tests: equality, null, OR, lt/lte.
  // Other operators match everything.
  function matchesWhere(
    row: Record<string, unknown>,
    where: Record<string, unknown> = {},
  ): boolean {
    return Object.entries(where).every(([k, v]) => {
      if (k === 'OR') {
        return (v as Record<string, unknown>[]).some((w) =>
          matchesWhere(row, w),
        );
      }
      if (v === undefined) return true;
      if (v === null) return row[k] == null;
      if (typeof v === 'object' && !(v instanceof Date)) {
        const cond = v as {
          lt?: Date;
          lte?: Date;
          equals?: string;
          mode?: string;
        };
        if (cond.equals !== undefined) {
          return cond.mode === 'insensitive'
            ? String(row[k]).toLowerCase() === cond.equals.toLowerCase()
            : row[k] === cond.equals;
        }
        const value = row[k] as Date | null | undefined;
        if (cond.lt) return value != null && value < cond.lt;
        if (cond.lte) return value != null && value <= cond.lte;
        return true;
      }
      return row[k] === v;
    });
  }

  const statusChanges: Array<Record<string, unknown>> = [];
  const sessions: Array<Record<string, unknown>> = [];
  const mock = {
    users,
    assets,
    statusChanges,
    sessions,
    authSession: {
      create: jest.fn(async ({ data }) => {
        const row = {
          createdAt: new Date(),
          revokedAt: null,
          revokedReason: null,
          ...data,
        };
        sessions.push(row);
        return row;
      }),
      findUnique: jest.fn(
        async ({ where }) => sessions.find((r) => r.id === where.id) ?? null,
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = sessions.filter((r) => matchesWhere(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    assetStatusChange: {
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `sc-${statusChanges.length + 1}`,
          changedAt: new Date(),
          ...data,
        };
        statusChanges.push(row);
        return row;
      }),
    },
    $executeRawUnsafe: jest.fn(async () => 0),
    // Interactive transactions run against the same in-memory rows.
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mock),
    ),
    asset: {
      update: jest.fn(),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = assets.filter((a) => matchesWhere(a, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
      delete: jest.fn(),
      findMany: jest.fn(async ({ where }) =>
        assets.filter((a) => matchesWhere(a, where)),
      ),
      findFirst: jest.fn(
        async ({ where }) => assets.find((a) => matchesWhere(a, where)) ?? null,
      ),
      count: jest.fn(
        async ({ where }) =>
          assets.filter((a) => matchesWhere(a, where)).length,
      ),
      create: jest.fn(async ({ data }) => {
        // Tags are unique per organization, as in the database.
        if (
          assets.some(
            (a) =>
              a.assetTagNumber === data.assetTagNumber &&
              a.organizationId === data.organizationId,
          )
        ) {
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
          });
        }
        return { id: 'new', ...data };
      }),
    },
    facility: {
      count: jest.fn(async ({ where }) =>
        where.id === FACILITY_A && where.organizationId === ORG_A ? 1 : 0,
      ),
    },
    department: { count: jest.fn(async () => 1) },
    room: {
      // ROOM_A belongs to ORG_A; anything else belongs to another organization.
      count: jest.fn(async ({ where }) => (where.id === ROOM_A ? 1 : 0)),
    },
    assetScanLog: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }) => ({
        id: 'scan-1',
        assetId: data.asset.connect.id,
        createdAt: new Date(),
        notes: null,
        locationHint: null,
        qrPayload: data.qrPayload,
      })),
    },
    usageLog: {
      findMany: jest.fn<
        Promise<unknown[]>,
        [{ where: Record<string, unknown> }]
      >(async () => []),
    },
    locationHistory: { create: jest.fn(async ({ data }) => data) },
    assetTelemetry: { create: jest.fn(async ({ data }) => data) },
    maintenanceEvent: { create: jest.fn(async ({ data }) => data) },
    errorEvent: { create: jest.fn(async ({ data }) => data) },
    notifications: [] as Array<Record<string, unknown>>,
    notification: {
      createMany: jest.fn(async ({ data }) => {
        mock.notifications.push(...data);
        return { count: data.length };
      }),
    },
    outboundMessage: { createMany: jest.fn(async () => ({ count: 0 })) },
    user: {
      // Recipients of notices: active people in the organization (the
      // role filter is checked in the work-order tests).
      findMany: jest.fn(async ({ where }) =>
        users.filter(
          (u) => u.organizationId === where.organizationId && u.isActive,
        ),
      ),
      count: jest.fn(async ({ where }) =>
        where.organizationId === ORG_A ? 1 : 0,
      ),
      findFirst: jest.fn(
        async ({ where }) =>
          users.find(
            (u) =>
              u.email.toLowerCase() ===
              String(where.email.equals).toLowerCase(),
          ) ?? null,
      ),
      findUnique: jest.fn(
        async ({ where }) => users.find((u) => u.id === where.id) ?? null,
      ),
      update: jest.fn(async ({ where, data }) => {
        const u = users.find((x) => x.id === where.id)! as Record<
          string,
          unknown
        >;
        for (const [key, value] of Object.entries(data)) {
          if (value === undefined) continue;
          // Support Prisma's atomic { increment: n }.
          u[key] =
            value && typeof value === 'object' && 'increment' in value
              ? (u[key] as number) + (value as { increment: number }).increment
              : value;
        }
        return u;
      }),
    },
  };
  return mock;
}

describe('Authentication and authorization (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    app = await createTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('JWT guard', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/assets').expect(401);
      expect(prisma.asset.findMany).not.toHaveBeenCalled();
    });

    it('rejects a token signed with a different secret', async () => {
      const forged =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwib3JnIjoib3JnLWEiLCJyb2xlIjoiYWRtaW4ifQ.c2lnbmF0dXJl';
      await request(app.getHttpServer())
        .get('/api/assets')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('rejects an expired token', async () => {
      const expired = createAccessToken(
        {
          id: 'u',
          organizationId: ORG_A,
          role: 'admin',
          permissions: [],
          email: 'e',
          firstName: 'f',
          lastName: 'l',
          sessionIssuedAt: 1,
        },
        { expiresIn: -10 },
      );
      await request(app.getHttpServer())
        .get('/api/assets')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });

    it('rejects a valid signature carrying an unknown role', async () => {
      const weird = createAccessToken({
        id: 'u',
        organizationId: ORG_A,
        role: 'superuser' as never,
        permissions: [],
        email: 'e',
        firstName: 'f',
        lastName: 'l',
        sessionIssuedAt: Math.floor(Date.now() / 1000),
      });
      await request(app.getHttpServer())
        .get('/api/assets')
        .set('Authorization', `Bearer ${weird}`)
        .expect(401);
    });
  });

  describe('organization scoping', () => {
    it('lists only the caller organization assets', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/assets')
        .set(bearer('viewer'))
        .expect(200);
      expect(res.body.items.map((a: { id: string }) => a.id)).toEqual([
        ASSET_A,
      ]);
      expect(res.body.total).toBe(1);
      expect(prisma.asset.findMany.mock.calls[0][0].where).toEqual({
        organizationId: ORG_A,
        deletedAt: null,
      });
    });

    it('caps page size at 100', async () => {
      await request(app.getHttpServer())
        .get('/api/assets?take=100000')
        .set(bearer('viewer'))
        .expect(200);
      expect(prisma.asset.findMany.mock.calls[0][0].take).toBe(100);
    });

    it("returns 404 for another organization's asset", async () => {
      await request(app.getHttpServer())
        .get(`/api/assets/${ASSET_B}`)
        .set(bearer('admin'))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/assets/${ASSET_B}/scans`)
        .set(bearer('admin'))
        .expect(404);
    });

    it('takes organization and creator from the token, not the body', async () => {
      const body = {
        assetTagNumber: 'NEW-1',
        equipmentName: 'Pump',
        manufacturer: 'BD',
        modelNumber: 'A1',
        serialNumber: 'S1',
        deviceCategory: 'THERAPEUTIC',
        criticalityLevel: 'HIGH',
        riskClassification: 'CLASS_II',
        purchaseDate: '2024-01-15T00:00:00Z',
        purchaseCost: 10,
        usefulLifeYears: 5,
        currentFacilityId: FACILITY_A,
        primaryCustodianId: '44444444-4444-4444-8444-444444444444',
        custodianDepartmentId: '55555555-5555-4555-8555-555555555555',
      };
      await request(app.getHttpServer())
        .post('/api/assets')
        .set(bearer('engineer'))
        .send(body)
        .expect(201);
      const data = prisma.asset.create.mock.calls[0][0].data;
      expect(data.organizationId).toBe(ORG_A);
      expect(data.createdById).toBe('user-engineer');

      // A client-supplied organizationId is rejected outright.
      await request(app.getHttpServer())
        .post('/api/assets')
        .set(bearer('engineer'))
        .send({ ...body, organizationId: ORG_B })
        .expect(400);
    });

    it('rejects a facility from another organization', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/assets')
        .set(bearer('engineer', ORG_B))
        .send({
          assetTagNumber: 'NEW-2',
          equipmentName: 'Pump',
          manufacturer: 'BD',
          modelNumber: 'A1',
          serialNumber: 'S1',
          deviceCategory: 'THERAPEUTIC',
          criticalityLevel: 'HIGH',
          riskClassification: 'CLASS_II',
          purchaseDate: '2024-01-15T00:00:00Z',
          purchaseCost: 10,
          usefulLifeYears: 5,
          currentFacilityId: FACILITY_A,
          primaryCustodianId: '44444444-4444-4444-8444-444444444444',
          custodianDepartmentId: '55555555-5555-4555-8555-555555555555',
        })
        .expect(400);
      expect(res.body.fields).toContain('currentFacilityId');
      expect(prisma.asset.create).not.toHaveBeenCalled();
    });

    it('scopes utilization queries and keeps both category and facility filters', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/assets/utilization/summary?category=LIFE_SUPPORT&facilityId=${FACILITY_A}`,
        )
        .set(bearer('viewer'))
        .expect(200);
      expect(prisma.usageLog.findMany.mock.calls[0][0].where.asset).toEqual({
        organizationId: ORG_A,
        deletedAt: null,
        deviceCategory: 'LIFE_SUPPORT',
        currentFacilityId: FACILITY_A,
      });
    });
  });

  describe('roles', () => {
    it.each([
      ['viewer', 'post', '/api/assets', 403],
      ['technician', 'post', '/api/assets', 403],
      ['clinical_staff', 'post', `/api/assets/${ASSET_A}/scans`, 201],
      ['viewer', 'post', `/api/assets/${ASSET_A}/scans`, 403],
      ['integration', 'get', '/api/assets', 403],
      ['viewer', 'post', '/api/v1/ingest/rtls', 403],
    ] as const)('%s %s %s -> %d', async (role, method, url, status) => {
      await request(app.getHttpServer())
        [method](url)
        .set(bearer(role))
        .send({ qrPayload: 'biotrakr://asset/x' })
        .expect(status);
    });

    it('lets integration accounts ingest only for their own organization', async () => {
      const event = {
        timestamp: '2026-10-08T10:00:00Z',
        assetId: ASSET_B,
        facilityId: FACILITY_A,
        tagId: 't1',
        sourceType: 'ble',
        eventType: 'position_update',
      };
      await request(app.getHttpServer())
        .post('/api/v1/ingest/rtls')
        .set(bearer('integration'))
        .send(event)
        .expect(404);
      expect(prisma.locationHistory.create).not.toHaveBeenCalled();

      await request(app.getHttpServer())
        .post('/api/v1/ingest/rtls')
        .set(bearer('integration'))
        .send({ ...event, assetId: ASSET_A })
        .expect(201);
      expect(prisma.locationHistory.create).toHaveBeenCalledTimes(1);
    });

    it("never moves an asset into another organization's room", async () => {
      const event = {
        timestamp: '2026-10-08T10:00:00Z',
        assetId: ASSET_A,
        facilityId: FACILITY_A,
        tagId: 't1',
        sourceType: 'ble',
        eventType: 'position_update',
        confidence: 0.95,
      };
      await request(app.getHttpServer())
        .post('/api/v1/ingest/rtls')
        .set(bearer('integration'))
        .send({ ...event, locationId: ROOM_OF_ORG_B })
        .expect(201);
      expect(prisma.asset.updateMany).not.toHaveBeenCalled();

      await request(app.getHttpServer())
        .post('/api/v1/ingest/rtls')
        .set(bearer('integration'))
        .send({ ...event, locationId: ROOM_A })
        .expect(201);
      expect(prisma.asset.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: ASSET_A,
            organizationId: ORG_A,
            deletedAt: null,
          }),
        }),
      );
      expect(prisma.assets[0].currentRoomId).toBe(ROOM_A);
    });

    it('rejects oversized ingestion batches', async () => {
      const one = {
        timestamp: '2026-10-08T10:00:00Z',
        assetId: ASSET_A,
        facilityId: FACILITY_A,
        tagId: 't1',
        sourceType: 'ble',
        eventType: 'position_update',
      };
      await request(app.getHttpServer())
        .post('/api/v1/ingest/rtls/batch')
        .set(bearer('integration'))
        .send({ events: Array.from({ length: 501 }, () => one) })
        .expect(400);
    });
  });

  describe('ingestion', () => {
    const post = (path: string, body: object) =>
      request(app.getHttpServer())
        .post(`/api/v1/ingest/${path}`)
        .set(bearer('integration'))
        .send(body);

    const telemetry = {
      name: 'device.ventilator.reading.pressure',
      timestamp: '2026-10-08T10:00:00Z',
      facilityId: FACILITY_A,
      assetId: ASSET_A,
      environment: 'test',
      serviceName: 'gateway',
      assetCategory: 'life_support',
      assetType: 'ventilator',
      eventCategory: 'operational',
      severity: 'info',
      value: 0,
      unit: 'cmH2O',
    };

    it('stores zero readings and scores as zero, not as missing', async () => {
      await post('telemetry', {
        ...telemetry,
        labels: {
          healthScore: 0,
          anomalyDetected: false,
          failureProbability: 0,
        },
      }).expect(201);

      expect(prisma.assetTelemetry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metricValue: 0,
          healthScore: 0,
          anomalyDetected: false,
          failureProbability: 0,
          severity: 'INFO',
          time: new Date('2026-10-08T10:00:00Z'),
        }),
      });
    });

    it('returns 400 with the reasons for an invalid event', async () => {
      const res = await post('telemetry', {
        ...telemetry,
        name: 'pressure',
        labels: { healthScore: 42.5 },
      }).expect(400);

      expect(res.body.errors).toEqual([
        expect.stringContaining('Invalid metric name format'),
        expect.stringContaining('Health score must be a whole number'),
      ]);
      expect(prisma.assetTelemetry.create).not.toHaveBeenCalled();
    });

    it('sets PM dates from when the work was done and never moves them back', async () => {
      const done = '2026-09-01T08:00:00Z';
      await post('maintenance', {
        timestamp: done,
        assetId: ASSET_A,
        facilityId: FACILITY_A,
        eventType: 'pm_completed',
        cost: 0,
      }).expect(201);

      expect(prisma.maintenanceEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cost: 0, time: new Date(done) }),
      });
      const asset = prisma.assets[0];
      expect(asset.lastPmDate).toEqual(new Date(done));
      // The asset's own 30-day PM frequency, counted from the completion time.
      expect(asset.nextPmDueDate).toEqual(new Date('2026-10-01T08:00:00Z'));

      // A late-arriving older PM record must not roll the dates back.
      await post('maintenance', {
        timestamp: '2026-08-01T08:00:00Z',
        assetId: ASSET_A,
        facilityId: FACILITY_A,
        eventType: 'pm_completed',
      }).expect(201);
      expect(asset.lastPmDate).toEqual(new Date(done));
      expect(asset.nextPmDueDate).toEqual(new Date('2026-10-01T08:00:00Z'));
    });

    it('rejects events stamped in the future by a wrong gateway clock', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = await post('maintenance', {
        timestamp: future,
        assetId: ASSET_A,
        facilityId: FACILITY_A,
        eventType: 'pm_completed',
      }).expect(400);
      expect(res.body.errors[0]).toMatch(/in the future/);
      expect(prisma.maintenanceEvent.create).not.toHaveBeenCalled();
      expect(prisma.assets[0].nextPmDueDate).toBeUndefined();
    });

    it('ignores RTLS fixes older than the last one applied', async () => {
      const fix = {
        assetId: ASSET_A,
        facilityId: FACILITY_A,
        tagId: 't1',
        sourceType: 'ble',
        eventType: 'position_update',
        confidence: 0.9,
        locationId: ROOM_A,
        coordinates: { x: 0, y: 0 },
      };
      await post('rtls', { ...fix, timestamp: '2026-10-08T10:00:00Z' }).expect(
        201,
      );
      await post('rtls', { ...fix, timestamp: '2026-10-08T09:00:00Z' }).expect(
        201,
      );

      expect(prisma.assets[0].lastSeenTimestamp).toEqual(
        new Date('2026-10-08T10:00:00Z'),
      );
      // Both fixes are still kept in the location history, with x/y of 0.
      expect(prisma.locationHistory.create).toHaveBeenCalledTimes(2);
      expect(prisma.locationHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ coordinatesX: 0, coordinatesY: 0 }),
      });
    });

    it('quarantines a device on a critical fault that needs intervention', async () => {
      await post('error', {
        timestamp: '2026-10-08T10:00:00Z',
        assetId: ASSET_A,
        facilityId: FACILITY_A,
        errorCode: 'E42',
        severity: 'critical',
        requiresIntervention: true,
      }).expect(201);

      expect(prisma.errorEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          severity: 'CRITICAL',
          errorCode: 'E42',
        }),
      });
      expect(prisma.assets[0].assetStatus).toBe('QUARANTINED');
      // Recorded with the fault as the reason, so biomed can see why.
      expect(prisma.statusChanges).toEqual([
        expect.objectContaining({
          assetId: ASSET_A,
          fromStatus: 'ACTIVE',
          toStatus: 'QUARANTINED',
          source: 'DEVICE_ALERT',
          reason: 'Critical fault E42 (needs intervention)',
        }),
      ]);
      expect(prisma.assets[1].assetStatus).toBeUndefined();
      // Nobody on the ward pressed anything, so biomed is told.
      expect(prisma.notifications).toEqual([
        expect.objectContaining({
          userId: 'u-admin',
          kind: 'device_alert',
          severity: 'critical',
          title: 'Device fault: ICU ventilator (VENT-A) taken out of use',
        }),
      ]);
    });

    it('reports per-event results in a batch without leaking database errors', async () => {
      prisma.assetTelemetry.create
        .mockImplementationOnce(async ({ data }) => data)
        .mockImplementationOnce(async () => {
          throw new Error('relation "asset_telemetry" does not exist');
        });

      const res = await post('telemetry/batch', {
        events: [
          telemetry,
          telemetry,
          { ...telemetry, assetId: ASSET_B }, // another organization's asset
          { ...telemetry, name: 'bad' },
        ],
      }).expect(201);

      expect(res.body).toEqual({
        success: false,
        processed: 1,
        failed: 3,
        errors: [
          { index: 1, message: 'Storage failed; retry this event' },
          {
            index: 2,
            message: 'Asset or facility not found in your organization',
          },
          {
            index: 3,
            message: expect.stringContaining('Invalid metric name format'),
          },
        ],
      });
      expect(JSON.stringify(res.body)).not.toContain('asset_telemetry');
    });

    it('lets a storage failure on a single event surface as a 5xx so gateways retry', async () => {
      prisma.assetTelemetry.create.mockImplementationOnce(async () => {
        throw new Error('connection lost');
      });
      await post('telemetry', telemetry).expect(500);
    });
  });

  describe('asset tags', () => {
    const newAsset = (assetTagNumber: string) => ({
      assetTagNumber,
      equipmentName: 'Pump',
      manufacturer: 'BD',
      modelNumber: 'A1',
      serialNumber: 'S1',
      deviceCategory: 'THERAPEUTIC',
      criticalityLevel: 'HIGH',
      riskClassification: 'CLASS_II',
      purchaseDate: '2024-01-15T00:00:00Z',
      purchaseCost: 10,
      usefulLifeYears: 5,
      currentFacilityId: FACILITY_A,
      primaryCustodianId: '44444444-4444-4444-8444-444444444444',
      custodianDepartmentId: '55555555-5555-4555-8555-555555555555',
    });

    it("lets two organizations use the same tag, revealing nothing about the other's devices", async () => {
      await request(app.getHttpServer())
        .post('/api/assets')
        .set(bearer('engineer'))
        .send(newAsset('VENT-B')) // VENT-B also exists in another organization
        .expect(201);
    });

    it('returns 409, not 500, when the tag is taken at the last moment', async () => {
      prisma.asset.create.mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );
      const res = await request(app.getHttpServer())
        .post('/api/assets')
        .set(bearer('engineer'))
        .send(newAsset('NEW-9'))
        .expect(409);
      expect(res.body.message).toBe('This asset tag number is already in use');
    });

    it('treats a tag differing only in case as already in use', async () => {
      await request(app.getHttpServer())
        .post('/api/assets')
        .set(bearer('engineer'))
        .send({
          assetTagNumber: 'vent-a', // VENT-A exists; scanning would be ambiguous
          equipmentName: 'Pump',
          manufacturer: 'BD',
          modelNumber: 'A1',
          serialNumber: 'S1',
          deviceCategory: 'THERAPEUTIC',
          criticalityLevel: 'HIGH',
          riskClassification: 'CLASS_II',
          purchaseDate: '2024-01-15T00:00:00Z',
          purchaseCost: 10,
          usefulLifeYears: 5,
          currentFacilityId: FACILITY_A,
          primaryCustodianId: '44444444-4444-4444-8444-444444444444',
          custodianDepartmentId: '55555555-5555-4555-8555-555555555555',
        })
        .expect(409);
      expect(prisma.asset.create).not.toHaveBeenCalled();
    });
  });

  describe('soft delete', () => {
    it('only admins may delete', async () => {
      for (const role of [
        'engineer',
        'technician',
        'viewer',
        'integration',
      ] as const) {
        await request(app.getHttpServer())
          .delete(`/api/assets/${ASSET_A}`)
          .set(bearer(role))
          .expect(403);
      }
      expect(prisma.asset.updateMany).not.toHaveBeenCalled();
    });

    it('marks the asset deleted, keeps the row, and hides it afterwards', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/assets/${ASSET_A}`)
        .set(bearer('admin'))
        .expect(200);
      expect(res.body.id).toBe(ASSET_A);
      expect(new Date(res.body.deletedAt).getTime()).toBeLessThanOrEqual(
        Date.now(),
      );

      // Never a hard delete.
      expect(prisma.asset.delete).not.toHaveBeenCalled();
      expect(prisma.assets.find((a) => a.id === ASSET_A)).toMatchObject({
        deletedById: 'user-admin',
      });

      const list = await request(app.getHttpServer())
        .get('/api/assets')
        .set(bearer('viewer'))
        .expect(200);
      expect(list.body).toEqual({ total: 0, items: [] });

      await request(app.getHttpServer())
        .get(`/api/assets/${ASSET_A}`)
        .set(bearer('viewer'))
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/assets/${ASSET_A}/scans`)
        .set(bearer('technician'))
        .send({ qrPayload: 'x' })
        .expect(404);
      // Deleting twice is a 404, not a second timestamp.
      await request(app.getHttpServer())
        .delete(`/api/assets/${ASSET_A}`)
        .set(bearer('admin'))
        .expect(404);
    });

    it("cannot delete another organization's asset", async () => {
      await request(app.getHttpServer())
        .delete(`/api/assets/${ASSET_B}`)
        .set(bearer('admin'))
        .expect(404);
      expect(prisma.assets.find((a) => a.id === ASSET_B)?.deletedAt).toBeNull();
    });
  });

  describe('login', () => {
    it('issues working tokens for valid credentials (case-insensitive email)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ADMIN@a.test', password: 'CorrectHorse1!' })
        .expect(200);
      expect(res.body.user).toMatchObject({
        id: 'u-admin',
        role: 'admin',
        organizationId: ORG_A,
      });
      expect(res.body).not.toHaveProperty('user.passwordHash');

      const me = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      expect(me.body).toMatchObject({
        userId: 'u-admin',
        organizationId: ORG_A,
        role: 'admin',
      });

      const refreshed = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: res.body.refreshToken })
        .expect(200);
      expect(refreshed.body.refreshToken).not.toBe(res.body.refreshToken);
      // A refresh token is not accepted as an access token.
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${res.body.refreshToken}`)
        .expect(401);
    });

    describe('refresh tokens', () => {
      const login = async () =>
        (
          await request(app.getHttpServer())
            .post('/api/auth/login')
            .send({ email: 'admin@a.test', password: 'CorrectHorse1!' })
            .expect(200)
        ).body as { refreshToken: string; accessToken: string };
      const refresh = (refreshToken: string) =>
        request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken });

      it('works once; replaying an old one later ends that sign-in', async () => {
        const first = await login();
        const second = (await refresh(first.refreshToken).expect(200)).body;

        // Replayed after the grace window: treated as stolen.
        prisma.sessions[0].revokedAt = new Date(Date.now() - 60_000);
        await refresh(first.refreshToken).expect(401);
        // ...so the legitimate newer token stops working too.
        await refresh(second.refreshToken).expect(401);
        expect(prisma.sessions.map((r) => r.revokedReason)).toEqual([
          'rotated',
          'reuse_detected',
        ]);
      });

      it('refuses a near-simultaneous second refresh without ending the sign-in', async () => {
        const first = await login();
        const second = (await refresh(first.refreshToken).expect(200)).body;
        await refresh(first.refreshToken).expect(401); // within the grace window
        await refresh(second.refreshToken).expect(200);
      });

      it('logs out this sign-in, and everywhere', async () => {
        const a = await login();
        const b = await login();
        await request(app.getHttpServer())
          .post('/api/auth/logout')
          .send({ refreshToken: a.refreshToken })
          .expect(204);
        await refresh(a.refreshToken).expect(401);
        await refresh(b.refreshToken).expect(200);

        const c = await login();
        const res = await request(app.getHttpServer())
          .post('/api/auth/logout-all')
          .set('Authorization', `Bearer ${c.accessToken}`)
          .expect(201);
        expect(res.body.ended).toBeGreaterThanOrEqual(2);
        await refresh(c.refreshToken).expect(401);
      });

      it('ends a sign-in 30 days after the password was entered, however often refreshed', async () => {
        const first = await login();
        // Pretend this sign-in started 29 days and 23 hours ago.
        const started = new Date(Date.now() - (30 * 24 - 1) * 3600 * 1000);
        prisma.sessions[0].signedInAt = started;
        await refresh(first.refreshToken).expect(200);
        const latest = prisma.sessions[prisma.sessions.length - 1];
        expect(latest.signedInAt).toEqual(started);
        // The new token expires with the sign-in, in about an hour, not in 7 days.
        expect((latest.expiresAt as Date).getTime() - Date.now()).toBeLessThan(
          3600 * 1000 + 5000,
        );
      });

      it('rejects refresh tokens that have no session (issued before sessions existed)', async () => {
        const { createRefreshToken } = await import('@biotrakr/utils');
        const legacy = createRefreshToken({
          id: 'u-admin',
          organizationId: ORG_A,
          role: 'admin',
          permissions: [],
          email: 'admin@a.test',
          firstName: 'Ada',
          lastName: 'Admin',
          sessionIssuedAt: Math.floor(Date.now() / 1000),
        });
        await refresh(legacy).expect(401);
      });
    });

    it('gives the same answer for an unknown email and a wrong password', async () => {
      const unknown = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@a.test', password: 'x' })
        .expect(401);
      const wrong = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@a.test', password: 'wrong' })
        .expect(401);
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it(`locks the account after ${MAX_FAILED_LOGINS} failed attempts`, async () => {
      for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'admin@a.test', password: 'wrong' })
          .expect(401);
      }
      expect(prisma.users[0].accountLockedUntil!.getTime()).toBeGreaterThan(
        Date.now(),
      );

      // Even the correct password is refused while locked.
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@a.test', password: 'CorrectHorse1!' })
        .expect((res) => expect([401, 429]).toContain(res.status));
    });

    it('rate-limits repeated attempts on one email', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'nobody@a.test', password: 'x' });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(5)).toEqual([429, 429]);
    });

    it("one person's failed attempts do not block a colleague on the same IP", async () => {
      for (let i = 0; i < 6; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'typo@a.test', password: 'x' });
      }
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@a.test', password: 'CorrectHorse1!' })
        .expect(200);
    });

    it('caps attempts per IP across many emails (password spraying)', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 32; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: `spray${i}@a.test`, password: 'x' });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(30)).toEqual([429, 429]);
    });

    it('signed-in users are rate-limited per user, not per shared IP', async () => {
      // Each user gets their own 300/min budget; well under it here.
      for (const role of ['viewer', 'technician'] as const) {
        await request(app.getHttpServer())
          .get('/api/assets')
          .set(bearer(role))
          .expect(200);
      }
    });
  });
});
