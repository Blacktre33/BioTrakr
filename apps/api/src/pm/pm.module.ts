import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { PmController } from './pm.controller';
import { PmJobsService } from './pm-jobs.service';
import { PmService } from './pm.service';

@Module({
  imports: [ContractsModule, AuditModule],
  controllers: [PmController],
  providers: [PmService, PmJobsService],
  exports: [PmJobsService],
})
export class PmModule {}
