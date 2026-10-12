import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentAdminGuard } from '../admin/current-admin.guard';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { SystemService } from './system.service';

/** The installation's own health. Administrators only. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@UseGuards(CurrentAdminGuard)
@Controller('admin/system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get()
  @ApiOperation({
    summary:
      'Backups, disk space, background jobs and outside messages: what is wrong now',
  })
  overview(@CurrentUser() user: AuthUser) {
    return this.system.overview(user);
  }

  @Post('test-alert')
  @HttpCode(200)
  // Each press sends real messages (an SMS costs money): a few a minute.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Send a test to yourself through each channel that is set up (email, SMS, webhook)',
  })
  testAlert(@CurrentUser() user: AuthUser) {
    return this.system.testAlert(user);
  }
}
