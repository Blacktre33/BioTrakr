import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { UtilizationController } from './utilization.controller';
import { UtilizationService } from './utilization.service';

@Module({
  imports: [PrismaModule],
  controllers: [UtilizationController],
  providers: [UtilizationService],
  exports: [UtilizationService],
})
export class UtilizationModule {}

