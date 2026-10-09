import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { Public } from '../src/auth/decorators';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp } from './helpers';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({
      $queryRaw: jest.fn(async () => [{ '?column?': 1 }]),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health is public and reveals no configuration', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).not.toHaveProperty('clientUrl');
    expect(res.body).not.toHaveProperty('environment');
  });
});

/** Routes that fail on purpose, to check what callers see. */
@Controller('test-failures')
class FailingController {
  @Public()
  @Get('crash')
  crash() {
    throw new Error('relation "secret_table" does not exist at line 42');
  }

  @Public()
  @Get('missing')
  missing() {
    throw new Prisma.PrismaClientKnownRequestError(
      'Record to update not found.',
      {
        code: 'P2025',
        clientVersion: '5.22.0',
      },
    );
  }
}

@Module({ controllers: [FailingController] })
class FailingModule {}

describe('Robustness (e2e)', () => {
  let app: INestApplication;
  const queryRaw = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, FailingModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw, telemetryIngestEvent: {} })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('reports ready only when the database answers', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200, { status: 'ok' });
    queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(503);
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
  });

  it('gives every response a request id, keeping a sensible one from the caller', async () => {
    const generated = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await request(app.getHttpServer())
      .get('/api/health')
      .set('x-request-id', 'lb-12345678')
      .expect(200);
    expect(kept.headers['x-request-id']).toBe('lb-12345678');
    const replaced = await request(app.getHttpServer())
      .get('/api/health')
      .set('x-request-id', 'bad id<script>')
      .expect(200);
    expect(replaced.headers['x-request-id']).not.toContain('<');
  });

  it('never shows internals in a 500, but gives a reference to quote', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/test-failures/crash')
      .expect(500);
    expect(JSON.stringify(res.body)).not.toContain('secret_table');
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.message).toContain(res.body.requestId);
  });

  it('answers malformed JSON and oversized bodies with 400 / 413, not 500', async () => {
    const bad = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    expect(bad.headers['x-request-id']).toBeDefined();

    const huge = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'a@b.c', password: 'x'.repeat(3 * 1024 * 1024) })
      .expect(413);
    expect(huge.body.message).toBe('The request is too large');
  });

  it('turns known database errors into the right status', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/test-failures/missing')
      .expect(404);
    expect(res.body.message).toBe('Not found');
  });

  it('accepts an ingestion batch larger than the 100 KB default body limit', async () => {
    const big = {
      events: Array.from({ length: 500 }, () => ({ padding: 'x'.repeat(400) })),
    };
    expect(JSON.stringify(big).length).toBeGreaterThan(150_000);
    // Refused for the role (403), not for its size (413).
    const res = await request(app.getHttpServer())
      .post('/api/v1/ingest/telemetry/batch')
      .set(bearer('viewer'))
      .send(big);
    expect(res.status).toBe(403);
  });
});
