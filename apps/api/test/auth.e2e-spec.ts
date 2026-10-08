import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';

import { createAccessToken } from '@biotrakr/utils';

import { MAX_FAILED_LOGINS } from '../src/auth/auth.service';
import { bearer, createTestApp, ORG_A, ORG_B } from './helpers';

const ASSET_A = '11111111-1111-4111-8111-111111111111';
const ASSET_B = '22222222-2222-4222-8222-222222222222';
const FACILITY_A = '33333333-3333-4333-8333-333333333333';

function buildPrisma() {
  // Fresh rows per test, since soft-delete tests mutate them.
  const assets: Array<{
    id: string;
    organizationId: string;
    assetTagNumber: string;
    deletedAt: Date | null;
    deletedById?: string;
  }> = [
    {
      id: ASSET_A,
      organizationId: ORG_A,
      assetTagNumber: 'VENT-A',
      deletedAt: null,
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

  const matchesWhere = (
    row: Record<string, unknown>,
    where: Record<string, unknown> = {},
  ) =>
    Object.entries(where).every(([k, v]) =>
      v === null
        ? row[k] == null
        : v === undefined || typeof v === 'object' || row[k] === v,
    );

  return {
    users,
    assets,
    asset: {
      update: jest.fn(async ({ where, data, select }) => {
        const row = assets.find((a) => a.id === where.id)!;
        Object.assign(row, data);
        return select
          ? Object.fromEntries(
              Object.keys(select).map((k) => [k, (row as never)[k]]),
            )
          : row;
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
      create: jest.fn(async ({ data }) => ({ id: 'new', ...data })),
    },
    facility: {
      count: jest.fn(async ({ where }) =>
        where.id === FACILITY_A && where.organizationId === ORG_A ? 1 : 0,
      ),
    },
    department: { count: jest.fn(async () => 1) },
    room: { count: jest.fn(async () => 1) },
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
    user: {
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
        const u = users.find((x) => x.id === where.id)!;
        Object.assign(
          u,
          Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          ),
        );
        return u;
      }),
    },
  };
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
      expect(res.body.map((a: { id: string }) => a.id)).toEqual([ASSET_A]);
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
      ['viewer', 'post', '/api/api/v1/ingest/rtls', 403],
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
        .post('/api/api/v1/ingest/rtls')
        .set(bearer('integration'))
        .send(event)
        .expect(404);
      expect(prisma.locationHistory.create).not.toHaveBeenCalled();

      await request(app.getHttpServer())
        .post('/api/api/v1/ingest/rtls')
        .set(bearer('integration'))
        .send({ ...event, assetId: ASSET_A })
        .expect(201);
      expect(prisma.locationHistory.create).toHaveBeenCalledTimes(1);
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
      expect(prisma.asset.update).not.toHaveBeenCalled();
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
      expect(list.body).toEqual([]);

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
      expect(prisma.asset.update).not.toHaveBeenCalled();
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

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: res.body.refreshToken })
        .expect(200);
      // A refresh token is not accepted as an access token.
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${res.body.refreshToken}`)
        .expect(401);
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

    it('rate-limits credential attempts', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'nobody@a.test', password: 'x' });
        statuses.push(res.status);
      }
      expect(statuses).toContain(429);
    });
  });
});
