import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { bearer, createTestApp, ORG_A } from './helpers';

const QUARANTINED_ID = '11111111-1111-4111-8111-111111111111';
const DISPOSED_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_ID = '33333333-3333-4333-8333-333333333333';
const FACILITY = '44444444-4444-4444-8444-444444444444';
const DEPT_IN_FACILITY = '55555555-5555-4555-8555-555555555555';
const DEPT_ELSEWHERE = '66666666-6666-4666-8666-666666666666';

function buildPrisma() {
  const assets = [
    {
      id: QUARANTINED_ID,
      organizationId: ORG_A,
      deletedAt: null,
      assetStatus: 'QUARANTINED',
      currentFacilityId: FACILITY,
      custodianDepartmentId: DEPT_IN_FACILITY,
    },
    {
      id: DISPOSED_ID,
      organizationId: ORG_A,
      deletedAt: null,
      assetStatus: 'DISPOSED',
      currentFacilityId: FACILITY,
      custodianDepartmentId: DEPT_IN_FACILITY,
    },
    {
      id: OTHER_ORG_ID,
      organizationId: 'org-b',
      deletedAt: null,
      assetStatus: 'QUARANTINED',
      currentFacilityId: FACILITY,
      custodianDepartmentId: DEPT_IN_FACILITY,
    },
  ];
  const changes: Array<Record<string, unknown>> = [];
  const match = (a: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v === null ? a[k] == null : a[k] === v,
    );

  const mock = {
    assets,
    changes,
    asset: {
      findFirst: jest.fn(
        async ({ where }) => assets.find((a) => match(a, where)) ?? null,
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = assets.filter((a) => match(a, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
    },
    assetStatusChange: {
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `c${changes.length + 1}`,
          changedAt: new Date(),
          ...data,
        };
        changes.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }) =>
        changes
          .filter((c) => c.assetId === where.assetId)
          .map((c) => ({
            ...c,
            changedBy: { firstName: 'Tara', lastName: 'Tech' },
          })),
      ),
    },
    facility: { count: jest.fn(async () => 1) },
    room: { count: jest.fn(async () => 1) },
    user: { count: jest.fn(async () => 1) },
    department: {
      count: jest.fn(async ({ where }) =>
        where.facilityId
          ? where.id === DEPT_IN_FACILITY && where.facilityId === FACILITY
            ? 1
            : 0
          : 1,
      ),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mock),
    ),
  };
  return mock;
}

describe('Device status changes (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    app = await createTestApp(prisma);
  });
  afterEach(async () => {
    await app.close();
  });

  const change = (
    id: string,
    body: object,
    role: Parameters<typeof bearer>[0] = 'technician',
  ) =>
    request(app.getHttpServer())
      .post(`/api/assets/${id}/status`)
      .set(bearer(role))
      .send(body);

  it('lets biomed release a quarantined device, recording who and why', async () => {
    const { body } = await change(QUARANTINED_ID, {
      status: 'ACTIVE',
      reason: 'Replaced flow sensor; passed electrical safety test',
      expectedStatus: 'QUARANTINED',
      confirmSafe: true,
    }).expect(200);

    expect(body).toMatchObject({
      changed: true,
      fromStatus: 'QUARANTINED',
      toStatus: 'ACTIVE',
    });
    expect(prisma.assets[0].assetStatus).toBe('ACTIVE');
    expect(prisma.changes).toEqual([
      expect.objectContaining({
        assetId: QUARANTINED_ID,
        fromStatus: 'QUARANTINED',
        toStatus: 'ACTIVE',
        source: 'MANUAL',
        changedById: 'user-technician',
        reason: 'Replaced flow sensor; passed electrical safety test',
      }),
    ]);

    const history = await request(app.getHttpServer())
      .get(`/api/assets/${QUARANTINED_ID}/status-history`)
      .set(bearer('clinical_staff'))
      .expect(200);
    expect(history.body).toEqual([
      expect.objectContaining({ toStatus: 'ACTIVE', changedBy: 'Tara Tech' }),
    ]);
  });

  it('requires a reason, the status seen, and a safety confirmation to release', async () => {
    const release = {
      status: 'ACTIVE',
      reason: 'Repaired and tested',
      expectedStatus: 'QUARANTINED',
      confirmSafe: true,
    };
    await change(QUARANTINED_ID, { ...release, reason: 'ok' }).expect(400);
    await change(QUARANTINED_ID, { ...release, reason: undefined }).expect(400);
    await change(QUARANTINED_ID, {
      ...release,
      expectedStatus: undefined,
    }).expect(400);
    const res = await change(QUARANTINED_ID, {
      ...release,
      confirmSafe: undefined,
    }).expect(400);
    expect(res.body.message).toMatch(/safe to use/);
    expect(prisma.changes).toEqual([]);
    expect(prisma.assets[0].assetStatus).toBe('QUARANTINED');
  });

  it('refuses when someone else changed the status first', async () => {
    const res = await change(QUARANTINED_ID, {
      status: 'ACTIVE',
      reason: 'Repaired and tested',
      expectedStatus: 'IN_MAINTENANCE',
    }).expect(409);
    expect(res.body.message).toMatch(/Someone else changed/);
    expect(prisma.assets[0].assetStatus).toBe('QUARANTINED');
  });

  it('is limited to biomed roles, and disposal is final except for admins', async () => {
    await change(
      QUARANTINED_ID,
      {
        status: 'ACTIVE',
        reason: 'Looks fine to me',
        expectedStatus: 'QUARANTINED',
        confirmSafe: true,
      },
      'clinical_staff',
    ).expect(403);
    await change(
      DISPOSED_ID,
      {
        status: 'ACTIVE',
        reason: 'Recorded as disposed by mistake',
        expectedStatus: 'DISPOSED',
        confirmSafe: true,
      },
      'engineer',
    ).expect(403);
    await change(
      DISPOSED_ID,
      {
        status: 'RETIRED',
        reason: 'Recorded as disposed by mistake',
        expectedStatus: 'DISPOSED',
      },
      'admin',
    ).expect(200);
  });

  it("cannot touch another organization's device", async () => {
    await change(OTHER_ORG_ID, {
      status: 'ACTIVE',
      reason: 'Repaired and tested',
      expectedStatus: 'QUARANTINED',
      confirmSafe: true,
    }).expect(404);
    expect(prisma.assets[2].assetStatus).toBe('QUARANTINED');
  });

  it('does not let a plain edit change the status', async () => {
    await request(app.getHttpServer())
      .patch(`/api/assets/${QUARANTINED_ID}`)
      .set(bearer('engineer'))
      .send({ assetStatus: 'ACTIVE' })
      .expect(400);
    expect(prisma.assets[0].assetStatus).toBe('QUARANTINED');
  });

  it("keeps a device's department inside its facility", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/assets/${QUARANTINED_ID}`)
      .set(bearer('engineer'))
      .send({ custodianDepartmentId: DEPT_ELSEWHERE })
      .expect(400);
    expect(res.body.fields).toEqual(['custodianDepartmentId']);
  });
});
