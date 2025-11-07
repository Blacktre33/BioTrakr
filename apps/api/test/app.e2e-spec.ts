import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(() => {
    // Ensure mandatory configuration variables exist while running the e2e
    // suite; the actual values are inconsequential for these tests.
    process.env.CLIENT_URL = process.env.CLIENT_URL ?? 'http://127.0.0.1:3000';
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test';
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
