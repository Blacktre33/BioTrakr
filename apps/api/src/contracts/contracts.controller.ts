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
import { ASSET_EDITOR_ROLES, BIOMED_ROLES, STAFF_ROLES } from '../auth/roles';
import {
  ContractInputDto,
  ListContractsQuery,
  TerminateContractDto,
  UpdateVendorDto,
  VendorInputDto,
} from './contracts.dto';
import { ContractsService } from './contracts.service';
import { VendorsService } from './vendors.service';

@ApiTags('contracts')
@ApiBearerAuth()
@Roles(...ASSET_EDITOR_ROLES)
@Controller()
export class ContractsController {
  constructor(
    private readonly contracts: ContractsService,
    private readonly vendors: VendorsService,
  ) {}

  @Get('contracts')
  @Roles(...BIOMED_ROLES)
  @ApiOperation({ summary: 'AMC/CMC contracts, soonest ending first' })
  list(@Query() query: ListContractsQuery, @CurrentUser() user: AuthUser) {
    return this.contracts.list(user, query);
  }

  @Get('contracts/:id')
  @Roles(...BIOMED_ROLES)
  @ApiOperation({ summary: 'A contract, with the cost of earlier years' })
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contracts.get(id, user);
  }

  @Post('contracts')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a contract covering one or more devices' })
  create(@Body() dto: ContractInputDto, @CurrentUser() user: AuthUser) {
    return this.contracts.create(dto, user);
  }

  @Patch('contracts/:id')
  @ApiOperation({ summary: "Replace a contract's details and devices" })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ContractInputDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contracts.update(id, dto, user);
  }

  @Post('contracts/:id/renewal')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Renew: a new contract for the next period, naming this one',
  })
  renew(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ContractInputDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contracts.renew(id, dto, user);
  }

  @Post('contracts/:id/termination')
  @HttpCode(200)
  @ApiOperation({ summary: 'End a contract early, with the reason' })
  terminate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TerminateContractDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contracts.terminate(id, dto, user);
  }

  @Get('assets/:assetId/cover')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: "A device's warranty and the contracts that cover or covered it",
  })
  cover(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contracts.coverForAsset(assetId, user);
  }

  @Get('vendors')
  @Roles(...BIOMED_ROLES)
  @ApiOperation({ summary: "The hospital's vendors" })
  listVendors(@CurrentUser() user: AuthUser) {
    return this.vendors.list(user);
  }

  @Post('vendors')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a vendor' })
  createVendor(@Body() dto: VendorInputDto, @CurrentUser() user: AuthUser) {
    return this.vendors.create(dto, user);
  }

  @Patch('vendors/:id')
  @ApiOperation({ summary: "Change a vendor's details" })
  updateVendor(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateVendorDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vendors.update(id, dto, user);
  }
}
