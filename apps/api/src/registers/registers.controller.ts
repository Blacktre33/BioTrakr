import { Controller, Get, Param, ParseEnumPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { DOCUMENT_READ_ROLES } from '../auth/roles';
import {
  REGISTER_KINDS,
  RegisterQuery,
  type RegisterKind,
} from './registers.dto';
import { RegistersService } from './registers.service';

const KINDS = Object.fromEntries(REGISTER_KINDS.map((k) => [k, k]));

@ApiTags('registers')
@ApiBearerAuth()
// Biomed, and auditors with a viewer account.
@Roles(...DOCUMENT_READ_ROLES)
@Controller('registers')
export class RegistersController {
  constructor(private readonly registers: RegistersService) {}

  @Get(':kind')
  @ApiOperation({
    summary:
      'A printable register: inventory (NHSRC Annexure F), survey (Annexure D), logbook (Annexure E, needs assetId), calibration, safety, pm, breakdown or contracts',
  })
  @ApiParam({ name: 'kind', enum: REGISTER_KINDS })
  build(
    @Param('kind', new ParseEnumPipe(KINDS)) kind: RegisterKind,
    @Query() query: RegisterQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.registers.build(kind, query, user);
  }
}
