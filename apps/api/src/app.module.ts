import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { THROTTLERS } from './auth/throttling';
import { IngestionModule } from './pipeline/ingestion.module';
import { PrismaModule } from './database/prisma.module';
import { ReferenceModule } from './reference/reference.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PmModule } from './pm/pm.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { requestIdMiddleware } from './common/request-id';
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
    ReferenceModule,
    WorkOrdersModule,
    AdminModule,
    NotificationsModule,
    DashboardModule,
    PmModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guards run in this order.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestIdMiddleware).forRoutes('*');
  }
}
