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
import { ASSET_EDITOR_ROLES, DOCUMENT_READ_ROLES } from '../auth/roles';
import { ListTrainingQuery, TrainingInputDto } from './training.dto';
import { TrainingService } from './training.service';

@ApiTags('training')
@ApiBearerAuth()
@Roles(...ASSET_EDITOR_ROLES)
@Controller('training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get()
  @Roles(...DOCUMENT_READ_ROLES)
  @ApiOperation({ summary: 'Training sessions, newest first' })
  list(@Query() query: ListTrainingQuery, @CurrentUser() user: AuthUser) {
    return this.training.list(user, query.assetId);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Record a training session and who attended' })
  create(@Body() dto: TrainingInputDto, @CurrentUser() user: AuthUser) {
    return this.training.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Correct a session's details and attendees" })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TrainingInputDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.training.update(id, dto, user);
  }
}
