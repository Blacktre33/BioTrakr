import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { STAFF_ROLES } from '../auth/roles';
import { ReferenceService, type AssetFormReference } from './reference.service';

@ApiTags('Reference data')
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@Controller('reference')
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Get('asset-form')
  @ApiOperation({
    summary:
      'Choices for the asset form: enum values and your organization’s facilities, departments and custodians',
  })
  getAssetForm(@CurrentUser() user: AuthUser): Promise<AssetFormReference> {
    return this.reference.getAssetFormReference(user.organizationId);
  }
}
