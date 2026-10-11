import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { BIOMED_ROLES, STAFF_ROLES } from '../auth/roles';
import {
  CalibrationCorrectionDto,
  CalibrationInputDto,
} from './calibration.dto';
import { CalibrationService } from './calibration.service';

@ApiTags('calibration')
@ApiBearerAuth()
@Roles(...BIOMED_ROLES)
@Controller()
export class CalibrationController {
  constructor(private readonly calibration: CalibrationService) {}

  @Get('assets/:assetId/calibrations')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary:
      "A device's calibration records, newest first (corrected ones marked)",
  })
  list(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.calibration.list(assetId, user);
  }

  @Post('assets/:assetId/calibrations')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Record a calibration without a work order (e.g. an existing certificate)',
  })
  create(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() dto: CalibrationInputDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.calibration.create(assetId, dto, user);
  }

  @Post('calibrations/:id/corrections')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Correct a calibration record: a new record replaces it, the original is kept',
  })
  correct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CalibrationCorrectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.calibration.correct(id, dto, user);
  }
}
