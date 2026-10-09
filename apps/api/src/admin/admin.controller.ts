import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import {
  CreateBuildingDto,
  CreateDepartmentDto,
  CreateFacilityDto,
  CreateFloorDto,
  CreateRoomDto,
  CreateUserDto,
  UpdateBuildingDto,
  UpdateDepartmentDto,
  UpdateFacilityDto,
  UpdateFloorDto,
  UpdateRoomDto,
  UpdateUserDto,
} from './admin.dto';
import { AdminService } from './admin.service';
import { CurrentAdminGuard } from './current-admin.guard';

const id = () => new ParseUUIDPipe();

/** Organization setup. Administrators only. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@UseGuards(CurrentAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('locations')
  @ApiOperation({
    summary: 'Facilities with their departments, buildings, floors and rooms',
  })
  locations(@CurrentUser() user: AuthUser) {
    return this.admin.locations(user);
  }

  @Post('facilities')
  createFacility(
    @Body() dto: CreateFacilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.createFacility(dto, user);
  }

  @Patch('facilities/:id')
  updateFacility(
    @Param('id', id()) fid: string,
    @Body() dto: UpdateFacilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.updateFacility(fid, dto, user);
  }

  @Post('departments')
  createDepartment(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.createDepartment(dto, user);
  }

  @Patch('departments/:id')
  updateDepartment(
    @Param('id', id()) did: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.updateDepartment(did, dto, user);
  }

  @Post('buildings')
  createBuilding(
    @Body() dto: CreateBuildingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.createBuilding(dto, user);
  }

  @Patch('buildings/:id')
  updateBuilding(
    @Param('id', id()) bid: string,
    @Body() dto: UpdateBuildingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.updateBuilding(bid, dto, user);
  }

  @Post('floors')
  createFloor(@Body() dto: CreateFloorDto, @CurrentUser() user: AuthUser) {
    return this.admin.createFloor(dto, user);
  }

  @Patch('floors/:id')
  updateFloor(
    @Param('id', id()) fid: string,
    @Body() dto: UpdateFloorDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.updateFloor(fid, dto, user);
  }

  @Post('rooms')
  createRoom(@Body() dto: CreateRoomDto, @CurrentUser() user: AuthUser) {
    return this.admin.createRoom(dto, user);
  }

  @Patch('rooms/:id')
  updateRoom(
    @Param('id', id()) rid: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.updateRoom(rid, dto, user);
  }

  @Get('users')
  @ApiOperation({ summary: 'People in your organization' })
  users(@CurrentUser() user: AuthUser) {
    return this.admin.users(user);
  }

  @Post('users')
  @ApiOperation({
    summary:
      'Create an account; returns a one-time password to give to the person (shown only once)',
  })
  createUser(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.admin.createUser(dto, user);
  }

  @Patch('users/:id')
  @ApiOperation({
    summary:
      'Change name, role, placement or active state; role changes and deactivation sign them out',
  })
  updateUser(
    @Param('id', id()) uid: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.updateUser(uid, dto, user);
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'New one-time password; signs the person out everywhere and unlocks the account',
  })
  resetPassword(@Param('id', id()) uid: string, @CurrentUser() user: AuthUser) {
    return this.admin.resetPassword(uid, user);
  }
}
