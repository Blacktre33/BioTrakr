import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { ContractAlertsService } from './contract-alerts.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { VendorsService } from './vendors.service';

@Module({
  imports: [PrismaModule],
  controllers: [ContractsController],
  providers: [ContractsService, VendorsService, ContractAlertsService],
  exports: [ContractAlertsService],
})
export class ContractsModule {}
