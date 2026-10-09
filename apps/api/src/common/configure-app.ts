import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** Ingestion batches of up to 500 events exceed Express's 100 KB default. */
export const JSON_BODY_LIMIT = '2mb';

/**
 * Settings shared by the real server and the e2e tests, so tests exercise
 * exactly what production runs.
 */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
