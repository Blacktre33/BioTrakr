import { Module } from '@nestjs/common';

import { PmController } from './pm.controller';
import { PmJobsService } from './pm-jobs.service';
import { PmService } from './pm.service';

@Module({
  controllers: [PmController],
  providers: [PmService, PmJobsService],
  exports: [PmJobsService],
})
export class PmModule {}
