import { Module } from '@nestjs/common';

import { SystemChecksService } from './system-checks.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  controllers: [SystemController],
  providers: [SystemChecksService, SystemService],
  exports: [SystemChecksService],
})
export class SystemModule {}
