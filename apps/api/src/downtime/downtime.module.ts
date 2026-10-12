import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { DowntimeService } from './downtime.service';

@Module({
  imports: [PrismaModule],
  providers: [DowntimeService],
  exports: [DowntimeService],
})
export class DowntimeModule {}
