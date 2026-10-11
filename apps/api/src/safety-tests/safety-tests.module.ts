import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { SafetyTestsController } from './safety-tests.controller';
import { SafetyTestsService } from './safety-tests.service';

@Module({
  imports: [PrismaModule],
  controllers: [SafetyTestsController],
  providers: [SafetyTestsService],
})
export class SafetyTestsModule {}
