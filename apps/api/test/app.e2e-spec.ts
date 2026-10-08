import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp } from './helpers';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({});
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
