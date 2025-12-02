import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

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

  const prismaMock: Partial<PrismaService> = {
    asset: {
      findUnique: jest.fn(async (args) => {
        if (args?.where?.id === assetId) {
          return { id: assetId };
        }
        return null;
      }),
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
      findMany: jest.fn(async ({ where }) => {
        return scanLogs
          .filter((row) => row.assetId === where?.assetId)
          .slice()
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }),
    },
  } as unknown as PrismaService;

  beforeAll(() => {
    process.env.CLIENT_URL = process.env.CLIENT_URL ?? 'http://127.0.0.1:3000';
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test';
  });

  beforeEach(async () => {
    scanLogs.length = 0;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
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
      .post(`/assets/${assetId}/scans`)
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
      .get(`/assets/${assetId}/scans`)
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          assetId,
          qrPayload: payload.qrPayload,
          notes: payload.notes,
          locationHint: payload.locationHint,
        });
      });
  });
});
