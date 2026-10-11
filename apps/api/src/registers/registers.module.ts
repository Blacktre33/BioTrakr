import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { RegistersController } from './registers.controller';
import { RegistersService } from './registers.service';

@Module({
  imports: [PrismaModule],
  controllers: [RegistersController],
  providers: [RegistersService],
})
export class RegistersModule {}
