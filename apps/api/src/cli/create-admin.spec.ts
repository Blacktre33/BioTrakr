import type { PrismaClient } from '@prisma/client';

import { createAdmin, parseArgs } from './create-admin';

type Rec = Record<string, unknown>;

function fakePrisma(users: Rec[] = [], orgs: Rec[] = []) {
  const prisma = {
    users,
    orgs,
    user: {
      findFirst: jest.fn(
        async ({ where }) =>
          users.find(
            (u) =>
              String(u.email).toLowerCase() ===
              String(where.email.equals).toLowerCase(),
          ) ?? null,
      ),
      update: jest.fn(async ({ where, data }) => {
        const u = users.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      }),
      create: jest.fn(async ({ data }) => {
        users.push({ id: `u${users.length + 1}`, isActive: true, ...data });
      }),
    },
    authSession: { updateMany: jest.fn(async () => ({ count: 0 })) },
    organization: {
      findMany: jest.fn(async () => orgs.slice(0, 2)),
      findFirst: jest.fn(
        async ({ where }) =>
          orgs.find(
            (o) =>
              String(o.name).toLowerCase() ===
              String(where.name.equals).toLowerCase(),
          ) ?? null,
      ),
      create: jest.fn(async ({ data }) => {
        const o = { id: `o${orgs.length + 1}`, ...data };
        orgs.push(o);
        return o;
      }),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

const run = (p: ReturnType<typeof fakePrisma>, argv: string) =>
  createAdmin(p as unknown as PrismaClient, parseArgs(argv.split(' ')));

describe('create-admin', () => {
  // Password hashing reads the security settings, as in the container.
  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-characters';
  });

  it('sets up a new installation with a one-time password', async () => {
    const p = fakePrisma();
    await expect(
      run(p, '--email it@h.example --first Ravi --last Kumar'),
    ).rejects.toThrow(/New installation: give --organization/);
    const r = await run(
      p,
      '--organization City --email IT@h.example --first Ravi --last Kumar',
    );
    expect(r).toMatchObject({ email: 'it@h.example', created: true });
    expect(r.password).toHaveLength(14);
    expect(p.users[0]).toMatchObject({
      role: 'admin',
      passwordChangeRequired: true,
    });
  });

  it('does not create an organization from a typo', async () => {
    const p = fakePrisma([], [{ id: 'o1', name: 'City General' }]);
    await expect(
      run(
        p,
        '--organization CityGeneral --email a@h.example --first A --last B',
      ),
    ).rejects.toThrow(/No organization is called "CityGeneral"/);
    expect(p.orgs).toHaveLength(1);
  });

  it('resets an administrator, but never silently promotes or reactivates', async () => {
    const p = fakePrisma([
      { id: 'u1', email: 'admin@h.example', role: 'admin', isActive: true },
      {
        id: 'u2',
        email: 'nurse@h.example',
        role: 'clinical_staff',
        isActive: true,
      },
      { id: 'u3', email: 'left@h.example', role: 'admin', isActive: false },
    ]);
    const ok = await run(p, '--email admin@h.example --reset');
    expect(ok).toMatchObject({ created: false, changes: [] });
    expect(p.users[0]).toMatchObject({
      passwordChangeRequired: true,
      role: 'admin',
    });

    await expect(run(p, '--email nurse@h.example --reset')).rejects.toThrow(
      /not an administrator/,
    );
    expect(p.users[1].role).toBe('clinical_staff');
    const promoted = await run(
      p,
      '--email nurse@h.example --reset --make-admin',
    );
    expect(promoted.changes).toEqual([
      'role changed from clinical_staff to admin',
    ]);

    await expect(run(p, '--email left@h.example --reset')).rejects.toThrow(
      /deactivated/,
    );
    expect(p.users[2].isActive).toBe(false);
    const back = await run(p, '--email left@h.example --reset --reactivate');
    expect(back.changes).toEqual(['account reactivated']);
  });
});
