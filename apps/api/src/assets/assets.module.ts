import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { AssetLookupService } from './asset-lookup.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { UtilizationModule } from './utilization.module';

@Module({
  imports: [PrismaModule, UtilizationModule],
  controllers: [AssetsController],
  providers: [AssetsService, AssetLookupService],
})
export class AssetsModule {}
