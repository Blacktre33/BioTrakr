import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { CalibrationController } from './calibration.controller';
import { CalibrationService } from './calibration.service';

@Module({
  imports: [PrismaModule],
  controllers: [CalibrationController],
  providers: [CalibrationService],
})
export class CalibrationModule {}
