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
import { BIOMED_ROLES, SCAN_ROLES } from '../auth/roles';
import {
  ListWorkOrdersQuery,
  ReportProblemDto,
  UpdateWorkOrderDto,
} from './work-order.dto';
import { WorkOrdersService } from './work-orders.service';

@ApiTags('work orders')
@ApiBearerAuth()
@Roles(...BIOMED_ROLES)
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Post('problem-reports')
  @HttpCode(201)
  @Roles(...SCAN_ROLES)
  @ApiOperation({
    summary:
      'Report a problem with a device (ward staff). Opens a work order for biomed; can take the device out of use.',
  })
  reportProblem(@Body() dto: ReportProblemDto, @CurrentUser() user: AuthUser) {
    return this.workOrders.reportProblem(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Work queue: open, assigned to me, or done; emergencies first',
  })
  list(@Query() query: ListWorkOrdersQuery, @CurrentUser() user: AuthUser) {
    return this.workOrders.list(query, user);
  }

  @Get('technicians')
  @ApiOperation({ summary: 'Biomed staff who can be assigned work' })
  technicians(@CurrentUser() user: AuthUser) {
    return this.workOrders.technicians(user);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Assign, progress, complete or cancel a work order; completing can release the device back into use',
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWorkOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workOrders.update(id, dto, user);
  }
}
