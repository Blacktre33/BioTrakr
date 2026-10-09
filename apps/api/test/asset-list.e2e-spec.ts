import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { bearer, createTestApp, ORG_A } from './helpers';

describe('Asset list: search, filters, paging (e2e)', () => {
  let app: INestApplication;
  const prisma = {
    asset: {
      count: jest.fn(async () => 42),
      findMany: jest.fn(async () => [{ id: 'a1' }]),
    },
  };

  beforeAll(async () => {
    app = await createTestApp(prisma);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());

  const list = (query: string) =>
    request(app.getHttpServer())
      .get(`/api/assets${query}`)
      .set(bearer('viewer'));
  const args = () =>
    (
      prisma.asset.findMany.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ]
    )[0];

  it('returns the page and the total for paging', async () => {
    const { body } = await list('?skip=25&take=25').expect(200);
    expect(body).toEqual({ total: 42, items: [{ id: 'a1' }] });
    expect(args()).toMatchObject({ skip: 25, take: 25 });
  });

  it('searches tag, name, serial, manufacturer and model, and combines filters', async () => {
    await list(
      '?search=vent&status=QUARANTINED,IN_MAINTENANCE&criticality=CRITICAL&pmOverdue=true',
    ).expect(200);
    const where = args().where as { AND: Array<Record<string, unknown>> };
    expect(where).toMatchObject({ organizationId: ORG_A, deletedAt: null });
    expect(where.AND).toEqual([
      {
        OR: expect.arrayContaining([
          { assetTagNumber: { contains: 'vent', mode: 'insensitive' } },
          { serialNumber: { contains: 'vent', mode: 'insensitive' } },
        ]),
      },
      { assetStatus: { in: ['QUARANTINED', 'IN_MAINTENANCE'] } },
      { criticalityLevel: { in: ['CRITICAL'] } },
      { nextPmDueDate: { lt: expect.any(Date) } },
    ]);
    // The count uses the same filter, so the total matches the list.
    expect(prisma.asset.count).toHaveBeenCalledWith({ where: args().where });
  });

  it('sorts by next PM with unscheduled devices last, and pages stably', async () => {
    await list('?sort=nextPm&order=asc').expect(200);
    expect(args().orderBy).toEqual([
      { nextPmDueDate: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
  });

  it('rejects unknown filter values and caps the page size', async () => {
    await list('?status=BROKEN').expect(400);
    await list('?sort=price').expect(400);
    await list('?take=5000').expect(200);
    expect(args().take).toBe(100);
  });
});
