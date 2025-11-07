import { Module } from '@nestjs/common';

import { AssetsModule } from './assets/assets.module';
import { IngestionModule } from './pipeline/ingestion.module';
import { PrismaModule } from './database/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [PrismaModule, IngestionModule, AssetsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
