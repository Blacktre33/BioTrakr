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
import { SafetyTestCorrectionDto, SafetyTestInputDto } from './safety-test.dto';
import { SafetyTestsService } from './safety-tests.service';

@ApiTags('electrical safety tests')
@ApiBearerAuth()
@Roles(...BIOMED_ROLES)
@Controller()
export class SafetyTestsController {
  constructor(private readonly safetyTests: SafetyTestsService) {}

  @Get('assets/:assetId/safety-tests')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary:
      "A device's electrical safety tests, newest first (corrected ones marked)",
  })
  list(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.safetyTests.list(assetId, user);
  }

  @Post('assets/:assetId/safety-tests')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Record a safety test without a work order (e.g. after a repair); pass or fail is worked out from IEC 62353 limits',
  })
  create(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() dto: SafetyTestInputDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.safetyTests.create(assetId, dto, user);
  }

  @Post('safety-tests/:id/corrections')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Correct a safety test record: a new record replaces it, the original is kept',
  })
  correct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SafetyTestCorrectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.safetyTests.correct(id, dto, user);
  }
}
