import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { CondemnationController } from './condemnation.controller';
import { CondemnationService } from './condemnation.service';

@Module({
  imports: [PrismaModule],
  controllers: [CondemnationController],
  providers: [CondemnationService],
})
export class CondemnationModule {}
