import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { TelemetryIngestionService } from './telemetry-ingestion.service';

@Module({
  imports: [PrismaModule],
  providers: [TelemetryIngestionService],
  exports: [TelemetryIngestionService],
})
export class IngestionModule {}
