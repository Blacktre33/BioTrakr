import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { BIOMED_ROLES } from '../auth/roles';
import { OpenPmWorkOrderDto, PmScheduleQuery } from './pm.dto';
import { PmJobsService } from './pm-jobs.service';
import { PmService } from './pm.service';

@ApiTags('preventive maintenance')
@ApiBearerAuth()
@Roles(...BIOMED_ROLES)
@Controller('pm')
export class PmController {
  constructor(
    private readonly pm: PmService,
    private readonly jobs: PmJobsService,
  ) {}

  @Get('schedule')
  @ApiOperation({
    summary:
      'PM calendar: devices due in a date range, PM done in it, and everything overdue',
  })
  schedule(@Query() query: PmScheduleQuery, @CurrentUser() user: AuthUser) {
    return this.pm.schedule(query, user);
  }

  @Post('work-orders')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Open a PM work order for a device now (409 if one is open)',
  })
  open(@Body() dto: OpenPmWorkOrderDto, @CurrentUser() user: AuthUser) {
    return this.pm.openWorkOrder(dto.assetId, user);
  }

  @Post('run')
  @HttpCode(200)
  @Roles('admin')
  @ApiOperation({
    summary:
      'Open the PM work orders now due in your organization, without waiting for the hourly run',
  })
  run(@CurrentUser() user: AuthUser) {
    return this.jobs.openDue(new Date(), user.organizationId);
  }
}
