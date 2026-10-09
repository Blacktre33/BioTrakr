import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { STAFF_ROLES } from '../auth/roles';
import { NotificationsService } from './notifications.service';

export class ListNotificationsQuery {
  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  take?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  @IsOptional()
  unreadOnly?: boolean;
}

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  @IsOptional()
  ids?: string[];

  @ApiPropertyOptional({ description: 'Mark everything read' })
  @IsBoolean()
  @IsOptional()
  all?: boolean;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'My notifications, newest first, with the unread count',
  })
  list(@Query() query: ListNotificationsQuery, @CurrentUser() user: AuthUser) {
    return this.notifications.list(query, user);
  }

  @Post('read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark some (ids) or all of my notifications read' })
  markRead(@Body() body: MarkReadDto, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(body, user);
  }
}
