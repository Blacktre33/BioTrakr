import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { DOCUMENT_READ_ROLES } from '../auth/roles';
import { ListAuditQuery } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
// Biomed, and auditors with a viewer account.
@Roles(...DOCUMENT_READ_ROLES)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({
    summary:
      'The edit history, newest first: for a device (assetId), one record, or a period',
  })
  list(@Query() query: ListAuditQuery, @CurrentUser() user: AuthUser) {
    return this.audit.list(query, user);
  }

  @Get('check')
  @ApiOperation({
    summary:
      "Recomputes the hospital's hash chain: whether any entry was altered or removed, and the head to write down",
  })
  check(@CurrentUser() user: AuthUser) {
    return this.audit.check(user.organizationId);
  }
}
