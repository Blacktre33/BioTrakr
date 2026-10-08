import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { loadApiConfig, loadSecurityConfig } from '@biotrakr/config';

import { AppModule } from './app.module';

/** The placeholder shipped in .env.example; never acceptable in production. */
const EXAMPLE_JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';

function assertSecurityConfig(nodeEnv: string): void {
  // Throws (and stops startup) if JWT_SECRET is missing or shorter than 32 characters.
  const { jwtSecret } = loadSecurityConfig();
  if (nodeEnv === 'production' && jwtSecret === EXAMPLE_JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is still the .env.example placeholder; set a real secret.',
    );
  }
}

async function bootstrap(): Promise<void> {
  assertSecurityConfig(loadApiConfig().nodeEnv);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a load balancer or reverse proxy, set TRUST_PROXY (e.g. "1" for one
  // hop) so rate limits see the real client IP instead of the proxy's.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.set(
      'trust proxy',
      /^\d+$/.test(trustProxy)
        ? Number(trustProxy)
        : trustProxy === 'true' || trustProxy,
    );
  }

  // Fix for BigInt serialization (Prisma uses BigInt)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  BigInt.prototype.toJSON = function () {
    return Number(this);
  };

  const config = loadApiConfig();

  app.use(helmet());
  app.enableCors({
    origin: config.allowedOrigins,
    credentials: true,
  });
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API docs are served outside the auth guards, so keep them off in
  // production unless explicitly enabled.
  const docsEnabled =
    config.nodeEnv !== 'production' || process.env.API_DOCS_ENABLED === 'true';
  if (docsEnabled) {
    const documentConfig = new DocumentBuilder()
      .setTitle('BioTrakr API')
      .setDescription('Medical Device Asset Management API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.port;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 API Server running (env: ${config.nodeEnv}) on port ${port}`);
  if (docsEnabled) {
    // eslint-disable-next-line no-console
    console.log('📚 API Documentation available at /api/docs');
  }
}

void bootstrap();
