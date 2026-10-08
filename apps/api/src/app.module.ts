import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { THROTTLERS } from './auth/throttling';
import { IngestionModule } from './pipeline/ingestion.module';
import { PrismaModule } from './database/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Per-user / per-IP limits; see auth/throttling.ts.
    ThrottlerModule.forRoot(THROTTLERS),
    PrismaModule,
    AuthModule,
    IngestionModule,
    AssetsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guards run in this order.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
