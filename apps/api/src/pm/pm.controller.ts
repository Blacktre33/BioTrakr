import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import {
  ASSET_EDITOR_ROLES,
  BIOMED_ROLES,
  DOCUMENT_READ_ROLES,
} from '../auth/roles';
import { ChecklistsService } from './checklists.service';
import {
  ChecklistInputDto,
  ChecklistQuery,
  OpenPmWorkOrderDto,
  PmScheduleQuery,
  UpdateChecklistDto,
} from './pm.dto';
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
    private readonly checklists: ChecklistsService,
  ) {}

  @Get('checklists')
  @ApiOperation({
    summary:
      'PM checklists, built-in and the hospital’s own; with assetId, the one that suits that device',
  })
  listChecklists(
    @Query() query: ChecklistQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.checklists.list(user, query.assetId);
  }

  @Post('checklists')
  @HttpCode(201)
  @Roles(...ASSET_EDITOR_ROLES)
  @ApiOperation({
    summary: 'Add a PM checklist (e.g. a copy of a built-in one)',
  })
  createChecklist(
    @Body() dto: ChecklistInputDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.checklists.create(dto, user);
  }

  @Patch('checklists/:id')
  @Roles(...ASSET_EDITOR_ROLES)
  @ApiOperation({
    summary:
      'Change a PM checklist, or retire it; past PMs keep what they recorded',
  })
  updateChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChecklistDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.checklists.update(id, dto, user);
  }

  @Get('records/:assetId')
  @Roles(...DOCUMENT_READ_ROLES)
  @ApiOperation({ summary: 'What each PM of a device found, item by item' })
  records(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.checklists.records(assetId, user);
  }

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
