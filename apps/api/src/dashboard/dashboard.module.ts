import { Module } from '@nestjs/common';

import { DowntimeModule } from '../downtime/downtime.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [DowntimeModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
