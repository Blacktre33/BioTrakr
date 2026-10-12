import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { DowntimeModule } from '../downtime/downtime.module';
import { ChecklistsService } from './checklists.service';
import { PmController } from './pm.controller';
import { PmJobsService } from './pm-jobs.service';
import { PmService } from './pm.service';

@Module({
  imports: [ContractsModule, AuditModule, DowntimeModule],
  controllers: [PmController],
  providers: [PmService, PmJobsService, ChecklistsService],
  exports: [PmJobsService],
})
export class PmModule {}
