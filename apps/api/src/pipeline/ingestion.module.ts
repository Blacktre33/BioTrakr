import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';

import { PrismaModule } from '../database/prisma.module';
import { TelemetryIngestionService } from './telemetry-ingestion.service';
import { IngestionService } from './ingestion/ingestion.service';
import { IngestionController } from './ingestion/ingestion.controller';
import { ExcelImportService } from './ingestion/excel-import.service';
import { ExcelImportController } from './ingestion/excel-import.controller';

@Module({
  imports: [
    PrismaModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
      },
    }),
  ],
  controllers: [IngestionController, ExcelImportController],
  providers: [
    TelemetryIngestionService,
    IngestionService,
    ExcelImportService,
  ],
  exports: [TelemetryIngestionService, IngestionService, ExcelImportService],
})
export class IngestionModule {}
