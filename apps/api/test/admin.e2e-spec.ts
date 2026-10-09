import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { hashPassword, verifyPassword } from '@biotrakr/utils';

import { bearer, createTestApp, ORG_A, ORG_B, tokenFor } from './helpers';

const FAC_A = '0a000000-0000-4000-8000-000000000001';
const FAC_B = '0b000000-0000-4000-8000-000000000001';
const ADMIN_ID = '0a000000-0000-4000-8000-0000000000ad';
const NURSE_ID = '0a000000-0000-4000-8000-00000000000e';

type Rec = Record<string, unknown>;
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/** In-memory organization data, with the relation filters the admin service uses. */
async function buildPrisma() {
  const facilities: Rec[] = [
    {
      id: FAC_A,
      organizationId: ORG_A,
      facilityCode: 'CG',
      facilityName: 'City General',
      isActive: true,
    },
    {
      id: FAC_B,
      organizationId: ORG_B,
      facilityCode: 'NW',
      facilityName: 'Other Org Hospital',
      isActive: true,
    },
  ];
  const departments: Rec[] = [];
  const buildings: Rec[] = [];
  const floors: Rec[] = [];
  const rooms: Rec[] = [];
  const sessions: Rec[] = [];
  const users: Rec[] = [
    {
      id: ADMIN_ID,
      organizationId: ORG_A,
      email: 'ada@a.test',
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'admin',
      isActive: true,
      passwordHash: await hashPassword('Old-password-123'),
      passwordChangeRequired: false,
      failedLoginAttempts: 0,
      accountLockedUntil: null,
    },
    {
      id: NURSE_ID,
      organizationId: ORG_A,
      email: 'nia@a.test',
      firstName: 'Nia',
      lastName: 'Nurse',
      role: 'clinical_staff',
      isActive: true,
      passwordHash: 'x',
      passwordChangeRequired: false,
      failedLoginAttempts: 3,
      accountLockedUntil: new Date(Date.now() + 60_000),
    },
  ];

  const facilityOf = (id: unknown) => facilities.find((f) => f.id === id);
  const buildingOf = (id: unknown) => buildings.find((b) => b.id === id);
  const floorOf = (id: unknown) => floors.find((f) => f.id === id);
  const parents: Record<string, (row: Rec) => Rec | undefined> = {
    facility: (row) => facilityOf(row.facilityId),
    building: (row) => buildingOf(row.buildingId),
    floor: (row) => floorOf(row.floorId),
  };
  const matches = (row: Rec, where: Rec = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v === undefined) return true;
      if (parents[k]) {
        const parent = parents[k](row);
        return Boolean(parent) && matches(parent!, v as Rec);
      }
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
        const c = v as { equals?: string; mode?: string; in?: unknown[] };
        if (c.equals !== undefined)
          return String(row[k]).toLowerCase() === c.equals.toLowerCase();
        if (c.in) return c.in.includes(row[k]);
        return true;
      }
      return v === null ? row[k] == null : row[k] === v;
    });

  /** Applies a flat Prisma `select` so tests see what the API would return. */
  const pick = (row: Rec, select?: Record<string, unknown>): Rec =>
    select
      ? Object.fromEntries(
          Object.keys(select)
            .filter((k) => k in row)
            .map((k) => [k, row[k]]),
        )
      : { ...row };

  /** CRUD on one array; `unique` lists field groups that must not repeat. */
  const table = (rows: Rec[], unique: string[][] = []) => ({
    findMany: jest.fn(async ({ where } = {} as { where?: Rec }) =>
      rows.filter((r) => matches(r, where)).map((r) => ({ ...r })),
    ),
    findFirst: jest.fn(
      async ({ where }) => rows.find((r) => matches(r, where)) ?? null,
    ),
    findUnique: jest.fn(
      async ({ where }) => rows.find((r) => r.id === where.id) ?? null,
    ),
    count: jest.fn(
      async ({ where }) => rows.filter((r) => matches(r, where)).length,
    ),
    create: jest.fn(async ({ data, select }) => {
      const row = { id: uuid(), ...data };
      for (const fields of unique) {
        if (rows.some((r) => fields.every((f) => r[f] === row[f]))) {
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
          });
        }
      }
      rows.push(row);
      return pick(row, select);
    }),
    update: jest.fn(async ({ where, data, select }) => {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return pick(row, select);
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const row of hit) {
        for (const fields of unique) {
          const next = { ...row, ...data };
          if (
            rows.some((r) => r !== row && fields.every((f) => r[f] === next[f]))
          ) {
            throw Object.assign(new Error('Unique constraint failed'), {
              code: 'P2002',
            });
          }
        }
        Object.assign(row, data);
      }
      return { count: hit.length };
    }),
  });

  const mock: Rec & Record<string, unknown> = {
    facilities,
    users,
    sessions,
    rooms,
    facility: table(facilities, [['organizationId', 'facilityCode']]),
    department: table(departments, [['facilityId', 'departmentCode']]),
    building: table(buildings, [['facilityId', 'buildingCode']]),
    floor: table(floors, [['buildingId', 'floorNumber']]),
    room: table(rooms, [['floorId', 'roomCode']]),
    user: table(users, [['email']]),
    authSession: table(sessions),
  };
  mock.$transaction = jest.fn(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(mock)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return mock as Rec & {
    facilities: Rec[];
    users: Rec[];
    sessions: Rec[];
    rooms: Rec[];
  };
}

describe('Organization setup (e2e)', () => {
  let app: INestApplication;
  let prisma: Awaited<ReturnType<typeof buildPrisma>>;
  const asAdmin = {
    Authorization: `Bearer ${tokenFor('admin', ORG_A, ADMIN_ID)}`,
  };

  beforeEach(async () => {
    prisma = await buildPrisma();
    app = await createTestApp(prisma);
  });
  afterEach(async () => {
    await app.close();
  });

  const post = (
    path: string,
    body: object,
    headers: Record<string, string> = asAdmin,
  ) =>
    request(app.getHttpServer())
      .post(`/api/admin/${path}`)
      .set(headers)
      .send(body);
  const patch = (
    path: string,
    body: object,
    headers: Record<string, string> = asAdmin,
  ) =>
    request(app.getHttpServer())
      .patch(`/api/admin/${path}`)
      .set(headers)
      .send(body);

  it('is for administrators only', async () => {
    for (const role of [
      'engineer',
      'technician',
      'clinical_staff',
      'viewer',
    ] as const) {
      await post(
        'facilities',
        { facilityCode: 'X1', facilityName: 'X' },
        bearer(role),
      ).expect(403);
    }
    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set(bearer('engineer'))
      .expect(403);
  });

  it('builds a facility down to rooms, inside the organization only', async () => {
    const fac = await post('facilities', {
      facilityCode: 'MW',
      facilityName: 'Maternity Wing',
      timezone: 'Asia/Kolkata',
    }).expect(201);
    expect(fac.body.organizationId).toBe(ORG_A);
    await post('facilities', {
      facilityCode: 'MW',
      facilityName: 'Again',
    }).expect(409);
    // Codes are per organization: another organization's code is free here.
    await post('facilities', {
      facilityCode: 'NW',
      facilityName: 'North Wing',
    }).expect(201);
    await post('facilities', {
      facilityCode: 'has space',
      facilityName: 'X',
    }).expect(400);
    await post('facilities', {
      facilityCode: 'TZ',
      facilityName: 'X',
      timezone: 'Mars/Base',
    }).expect(400);

    await post('departments', {
      facilityId: FAC_A,
      departmentCode: 'ICU',
      departmentName: 'Intensive Care',
    }).expect(201);
    await post('departments', {
      facilityId: FAC_A,
      departmentCode: 'ICU',
      departmentName: 'Dup',
    }).expect(409);
    await post('departments', {
      facilityId: FAC_B,
      departmentCode: 'ICU',
      departmentName: 'Theirs',
    }).expect(404);

    const b = await post('buildings', {
      facilityId: FAC_A,
      buildingCode: 'A',
      buildingName: 'Block A',
    }).expect(201);
    const f = await post('floors', {
      buildingId: b.body.id,
      floorNumber: 2,
      floorName: 'Second',
    }).expect(201);
    await post('floors', { buildingId: b.body.id, floorNumber: 2 }).expect(409);
    const r = await post('rooms', {
      floorId: f.body.id,
      roomCode: 'ICU-3',
      roomName: 'ICU Bay 3',
    }).expect(201);
    await patch(`rooms/${r.body.id}`, {
      roomName: 'ICU Bay 3 (isolation)',
    }).expect(200);
    expect(prisma.rooms[0].roomName).toBe('ICU Bay 3 (isolation)');

    const tree = await request(app.getHttpServer())
      .get('/api/admin/locations')
      .set(asAdmin)
      .expect(200);
    expect(
      (prisma.facility as { findMany: jest.Mock }).findMany,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { organizationId: ORG_A } }),
    );
    expect(tree.status).toBe(200);
  });

  it("cannot change another organization's facility", async () => {
    await patch(`facilities/${FAC_B}`, { facilityName: 'Hijacked' }).expect(
      404,
    );
    expect(prisma.facilities[1].facilityName).toBe('Other Org Hospital');
    await patch(`facilities/${FAC_A}`, { isActive: false }).expect(200);
    expect(prisma.facilities[0].isActive).toBe(false);
  });

  it('creates accounts with a one-time password that must be changed', async () => {
    const res = await post('users', {
      email: 'Tara.Tech@A.test',
      firstName: 'Tara',
      lastName: 'Tech',
      role: 'technician',
      facilityId: FAC_A,
    }).expect(201);

    const { temporaryPassword, user } = res.body;
    expect(temporaryPassword).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{14}$/);
    expect(user).toMatchObject({
      email: 'tara.tech@a.test',
      role: 'technician',
      passwordChangeRequired: true,
    });
    expect(user).not.toHaveProperty('passwordHash');
    const stored = prisma.users.find((u) => u.email === 'tara.tech@a.test')!;
    expect(stored.passwordHash).not.toBe(temporaryPassword);
    expect(
      await verifyPassword(temporaryPassword, stored.passwordHash as string),
    ).toBe(true);

    await post('users', {
      email: 'tara.tech@a.test',
      firstName: 'T',
      lastName: 'T',
      role: 'viewer',
    }).expect(409);
    await post('users', {
      email: 'x@a.test',
      firstName: 'X',
      lastName: 'X',
      role: 'superuser',
    }).expect(400);
  });

  it('signs a person out everywhere when deactivated, and keeps at least one admin', async () => {
    prisma.sessions.push({ id: 's1', userId: NURSE_ID, revokedAt: null });
    await patch(`users/${NURSE_ID}`, { isActive: false }).expect(200);
    expect(prisma.sessions[0]).toMatchObject({
      revokedReason: 'account_changed',
    });

    const self = await patch(`users/${ADMIN_ID}`, { role: 'engineer' }).expect(
      400,
    );
    expect(self.body.message).toMatch(/your own administrator access/);
  });

  it('resets a password: new one-time password, unlocked, signed out', async () => {
    prisma.sessions.push({ id: 's1', userId: NURSE_ID, revokedAt: null });
    const res = await post(`users/${NURSE_ID}/reset-password`, {}).expect(200);
    expect(res.body.temporaryPassword).toHaveLength(14);
    const nurse = prisma.users[1];
    expect(nurse).toMatchObject({
      passwordChangeRequired: true,
      failedLoginAttempts: 0,
      accountLockedUntil: null,
    });
    expect(prisma.sessions[0].revokedReason).toBe('password_reset');
  });

  it('lets people change their own password, with sensible rules', async () => {
    const change = (body: object) =>
      request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set(asAdmin)
        .send(body);

    const wrong = await change({
      currentPassword: 'nope',
      newPassword: 'a-long-new-passphrase',
    }).expect(400);
    expect(wrong.body.fields).toEqual(['currentPassword']);
    await change({
      currentPassword: 'Old-password-123',
      newPassword: 'short',
    }).expect(400);
    await change({
      currentPassword: 'Old-password-123',
      newPassword: 'password123',
    }).expect(400);

    prisma.sessions.push({ id: 's1', userId: ADMIN_ID, revokedAt: null });
    await change({
      currentPassword: 'Old-password-123',
      newPassword: 'green tea at seven',
    }).expect(204);
    expect(
      await verifyPassword(
        'green tea at seven',
        prisma.users[0].passwordHash as string,
      ),
    ).toBe(true);
    expect(prisma.sessions[0].revokedReason).toBe('password_changed');
  });
});
