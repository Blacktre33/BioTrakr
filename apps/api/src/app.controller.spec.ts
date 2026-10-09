import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './database/prisma.service';

describe('AppController', () => {
  let appController: AppController;

  beforeAll(async () => {
    // Hydrate the shared configuration with safe test defaults so the new
    // loaders can parse successfully during unit tests.
    process.env.CLIENT_URL = process.env.CLIENT_URL ?? 'http://127.0.0.1:3000';
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test';

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: { $queryRaw: jest.fn() } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return a healthy heartbeat payload', () => {
    const response = appController.getHealth();
    expect(response.status).toBe('ok');
  });
});
