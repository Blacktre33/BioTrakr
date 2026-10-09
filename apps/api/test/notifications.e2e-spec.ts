import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { bearer, createTestApp, ORG_A, ORG_B, tokenFor } from './helpers';

type Rec = Record<string, unknown>;
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function buildPrisma() {
  const now = Date.now();
  const rows: Rec[] = [
    {
      id: id(1),
      userId: 'user-technician',
      organizationId: ORG_A,
      title: 'Mine, unread',
      readAt: null,
      createdAt: new Date(now - 1000),
    },
    {
      id: id(2),
      userId: 'user-technician',
      organizationId: ORG_A,
      title: 'Mine, read',
      readAt: new Date(),
      createdAt: new Date(now - 2000),
    },
    {
      id: id(3),
      userId: 'user-engineer',
      organizationId: ORG_A,
      title: 'Someone else’s',
      readAt: null,
      createdAt: new Date(now),
    },
    {
      id: id(4),
      userId: 'user-technician',
      organizationId: ORG_A,
      title: 'Too old',
      readAt: null,
      createdAt: new Date(now - 40 * 86_400_000),
    },
  ];
  const matches = (r: Rec, where: Rec): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v === null) return r[k] == null;
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const c = v as { in?: unknown[]; gte?: Date };
        if (c.in) return c.in.includes(r[k]);
        if (c.gte) return (r[k] as Date) >= c.gte;
      }
      return r[k] === v;
    });
  return {
    rows,
    notification: {
      count: jest.fn(
        async ({ where }) => rows.filter((r) => matches(r, where)).length,
      ),
      findMany: jest.fn(async ({ where, take }) =>
        rows
          .filter((r) => matches(r, where))
          .sort(
            (a, b) =>
              (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
          )
          .slice(0, take),
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
  };
}

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof buildPrisma>;
  const asTech = bearer('technician');

  beforeEach(async () => {
    prisma = buildPrisma();
    app = await createTestApp(prisma);
  });
  afterEach(async () => {
    await app.close();
  });

  it('lists only my own recent notices, newest first, with the unread count', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/notifications')
      .set(asTech)
      .expect(200);
    expect(res.body.unread).toBe(1);
    expect(res.body.items.map((n: Rec) => n.title)).toEqual([
      'Mine, unread',
      'Mine, read',
    ]);

    const unread = await request(app.getHttpServer())
      .get('/api/notifications?unreadOnly=1')
      .set(asTech)
      .expect(200);
    expect(unread.body.items).toHaveLength(1);
    await request(app.getHttpServer())
      .get('/api/notifications?take=500')
      .set(asTech)
      .expect(400);
  });

  it('marks only my own notices read', async () => {
    // Someone else's id is silently ignored.
    const res = await request(app.getHttpServer())
      .post('/api/notifications/read')
      .set(asTech)
      .send({ ids: [id(1), id(3)] })
      .expect(200);
    expect(res.body).toEqual({ updated: 1 });
    expect(prisma.rows[2].readAt).toBeNull();

    await request(app.getHttpServer())
      .post('/api/notifications/read')
      .set(asTech)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/notifications/read')
      .set(asTech)
      .send({ ids: ['not-a-uuid'] })
      .expect(400);
  });

  it('keeps organizations apart and machines out', async () => {
    const otherOrg = {
      Authorization: `Bearer ${tokenFor('technician', ORG_B)}`,
    };
    const res = await request(app.getHttpServer())
      .get('/api/notifications')
      .set(otherOrg)
      .expect(200);
    expect(res.body).toEqual({ unread: 0, items: [] });
    await request(app.getHttpServer())
      .get('/api/notifications')
      .set(bearer('integration'))
      .expect(403);
  });
});
