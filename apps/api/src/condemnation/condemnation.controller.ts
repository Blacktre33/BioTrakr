import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { ASSET_EDITOR_ROLES, DOCUMENT_READ_ROLES } from '../auth/roles';
import {
  CondemnationQuery,
  DecideCondemnationDto,
  DisposeCondemnationDto,
  ProposeCondemnationDto,
  WithdrawCondemnationDto,
} from './condemnation.dto';
import { CondemnationService } from './condemnation.service';

@ApiTags('condemnation')
@ApiBearerAuth()
@Roles(...ASSET_EDITOR_ROLES)
@Controller('condemnations')
export class CondemnationController {
  constructor(private readonly condemnation: CondemnationService) {}

  @Get()
  @Roles(...DOCUMENT_READ_ROLES)
  @ApiOperation({
    summary: "A device's condemnation proposals, and its record now",
  })
  forAsset(@Query() query: CondemnationQuery, @CurrentUser() user: AuthUser) {
    return this.condemnation.forAsset(query.assetId, user);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Propose a device for condemnation' })
  propose(@Body() dto: ProposeCondemnationDto, @CurrentUser() user: AuthUser) {
    return this.condemnation.propose(dto, user);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Roles('admin')
  @ApiOperation({
    summary: "Record the committee's decision (not by whoever proposed it)",
  })
  decide(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DecideCondemnationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.condemnation.decide(id, dto, user);
  }

  @Post(':id/withdrawal')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Withdraw a proposal, or (administrators) reverse an approval',
  })
  withdraw(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: WithdrawCondemnationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.condemnation.withdraw(id, dto, user);
  }

  @Post(':id/disposal')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record how a condemned device was disposed of' })
  dispose(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DisposeCondemnationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.condemnation.dispose(id, dto, user);
  }
}
