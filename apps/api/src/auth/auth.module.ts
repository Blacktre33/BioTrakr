import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/** Login and token refresh. The global guards are registered in AppModule. */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
