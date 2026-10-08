import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { createAccessToken } from '@biotrakr/utils';

import { AppModule } from '../src/app.module';
import type { Role } from '../src/auth/roles';
import { PrismaService } from '../src/database/prisma.service';

export const ORG_A = 'org-a';
export const ORG_B = 'org-b';

/** Signs a real access token, exactly as /auth/login would. */
export function tokenFor(
  role: Role,
  organizationId = ORG_A,
  userId = `user-${role}`,
): string {
  return createAccessToken({
    id: userId,
    organizationId,
    role,
    permissions: [],
    email: `${role}@example.test`,
    firstName: 'Test',
    lastName: role,
    sessionIssuedAt: Math.floor(Date.now() / 1000),
  });
}

export const bearer = (role: Role, org = ORG_A) => ({
  Authorization: `Bearer ${tokenFor(role, org)}`,
});

/** Boots the real AppModule (guards, pipes, routes) on top of a mocked Prisma. */
export async function createTestApp(
  prismaMock: unknown,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}
