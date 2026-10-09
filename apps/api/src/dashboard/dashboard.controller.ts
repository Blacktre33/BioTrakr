import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { STAFF_ROLES } from '../auth/roles';
import { DashboardQuery } from './dashboard.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary:
      'Devices out of use, PM overdue and due soon, open and urgent work orders, time to repair',
  })
  summary(@Query() query: DashboardQuery, @CurrentUser() user: AuthUser) {
    return this.dashboard.summary(query, user);
  }
}
