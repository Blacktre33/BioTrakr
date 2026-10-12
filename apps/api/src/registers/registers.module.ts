import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../database/prisma.module';
import { DowntimeModule } from '../downtime/downtime.module';
import { RegistersController } from './registers.controller';
import { RegistersService } from './registers.service';

@Module({
  imports: [PrismaModule, AuditModule, DowntimeModule],
  controllers: [RegistersController],
  providers: [RegistersService],
})
export class RegistersModule {}
