import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { bearer, createTestApp, ORG_A } from './helpers';

describe('Asset scan routes (e2e)', () => {
  let app: INestApplication;

  const assetId = 'f7f0c9f8-0614-4bf2-9e51-b6f73a626b1c';
  const scanLogs: Array<{
    id: string;
    assetId: string;
    qrPayload: string;
    notes: string | null;
    locationHint: string | null;
    createdAt: Date;
  }> = [];

  const prismaMock = {
    asset: {
      findFirst: jest.fn(async ({ where }) =>
        where?.id === assetId && where?.organizationId === ORG_A
          ? { id: assetId }
          : null,
      ),
    },
    assetScanLog: {
      create: jest.fn(async ({ data }) => {
        const record = {
          id: 'scan-' + (scanLogs.length + 1),
          assetId,
          qrPayload: data.qrPayload,
          notes: data.notes ?? null,
          locationHint: data.locationHint ?? null,
          createdAt: new Date(),
        };
        scanLogs.push(record);
        return record;
      }),
      findMany: jest.fn(async ({ where }) =>
        scanLogs
          .filter((row) => row.assetId === where?.assetId)
          .slice()
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    },
  };

  beforeEach(async () => {
    scanLogs.length = 0;
    app = await createTestApp(prismaMock);
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('records and retrieves asset scan logs', async () => {
    const payload = {
      qrPayload: 'biotrakr://asset/' + assetId,
      notes: 'Verified in storage closet',
      locationHint: 'Building A - Floor 3',
    };

    await request(app.getHttpServer())
      .post(`/api/assets/${assetId}/scans`)
      .set(bearer('technician'))
      .send(payload)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          assetId,
          qrPayload: payload.qrPayload,
          notes: payload.notes,
          locationHint: payload.locationHint,
        });
        expect(body.id).toBeDefined();
        expect(body.createdAt).toBeDefined();
      });

    await request(app.getHttpServer())
      .get(`/api/assets/${assetId}/scans`)
      .set(bearer('viewer'))
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          assetId,
          qrPayload: payload.qrPayload,
        });
      });
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get(`/api/assets/${assetId}/scans`)
      .expect(401);
  });
});
