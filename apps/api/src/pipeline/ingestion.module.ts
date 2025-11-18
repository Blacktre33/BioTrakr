import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { TelemetryIngestionService } from './telemetry-ingestion.service';
import { IngestionService } from './ingestion/ingestion.service';
import { IngestionController } from './ingestion/ingestion.controller';

@Module({
  imports: [PrismaModule],
  controllers: [IngestionController],
  providers: [TelemetryIngestionService, IngestionService],
  exports: [TelemetryIngestionService, IngestionService],
})
export class IngestionModule {}
