import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import {
  ASSET_EDITOR_ROLES,
  BIOMED_ROLES,
  SCAN_ROLES,
  STAFF_ROLES,
} from '../auth/roles';
import { AssetLookupService } from './asset-lookup.service';
import { AssetStatusService } from './asset-status.service';
import { AssetsService, MAX_PAGE_SIZE } from './assets.service';
import { CreateAssetScanDto } from './dto/create-asset-scan.dto';
import { AssetScanLogDto } from './dto/asset-scan-log.dto';
import {
  ChangeAssetStatusDto,
  CreateAssetDto,
  UpdateAssetDto,
} from './dto/create-asset.dto';

@ApiTags('assets')
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@Controller('assets')
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly lookupService: AssetLookupService,
    private readonly statusService: AssetStatusService,
  ) {}

  @Post()
  @HttpCode(201)
  @Roles(...ASSET_EDITOR_ROLES)
  @ApiOperation({ summary: 'Create a new asset' })
  @ApiCreatedResponse({
    description: 'The asset has been successfully created.',
  })
  async create(
    @Body() createAssetDto: CreateAssetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assetsService.create(createAssetDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List assets in your organization, with pagination',
  })
  @ApiOkResponse({ description: 'List of assets' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({
    name: 'take',
    required: false,
    type: Number,
    description: `Max ${MAX_PAGE_SIZE}`,
  })
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(20), ParseIntPipe) take: number,
  ) {
    return this.assetsService.findAll(user, {
      skip: Math.max(0, skip),
      take: Math.min(Math.max(1, take), MAX_PAGE_SIZE),
    });
  }

  // Declared before ':id' so "lookup" is not taken for an asset id.
  @Get('lookup')
  @ApiOperation({
    summary:
      'Find the device behind a scanned or typed code (tag number, asset id, QR payload or scan link), with safety alerts',
  })
  @ApiQuery({ name: 'code', required: true, type: String })
  @ApiOkResponse({ description: 'Device summary for the bedside' })
  async lookup(@Query('code') code: string, @CurrentUser() user: AuthUser) {
    return this.lookupService.lookup(code, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single asset by ID' })
  @ApiOkResponse({ description: 'The asset details' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const asset = await this.assetsService.findOne(id, user);
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    return asset;
  }

  @Patch(':id')
  @Roles(...ASSET_EDITOR_ROLES)
  @ApiOperation({ summary: 'Update an existing asset' })
  @ApiOkResponse({ description: 'The updated asset' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateAssetDto: UpdateAssetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assetsService.update(id, updateAssetDto, user);
  }

  @Post(':id/status')
  @HttpCode(200)
  @Roles(...BIOMED_ROLES)
  @ApiOperation({
    summary:
      'Change a device status (e.g. release from quarantine). Requires a reason; recorded in the status history.',
  })
  @ApiOkResponse({ description: 'The change that was made' })
  async changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ChangeAssetStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.statusService.changeStatus(id, body, user);
  }

  @Get(':id/status-history')
  @ApiOperation({ summary: 'Every status change of a device: who, when, why' })
  async statusHistory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.statusService.history(id, user);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({
    summary: 'Soft-delete an asset (admin only); its history is kept',
  })
  @ApiOkResponse({ description: 'The deleted asset id and deletion time' })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assetsService.remove(id, user);
  }

  @Post(':assetId/scans')
  @HttpCode(201)
  @Roles(...SCAN_ROLES)
  @ApiOperation({ summary: 'Record a QR scan for an asset' })
  @ApiCreatedResponse({ type: AssetScanLogDto })
  async createAssetScan(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() payload: CreateAssetScanDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AssetScanLogDto> {
    const record = await this.assetsService.createAssetScan(
      assetId,
      payload,
      user,
    );
    return AssetScanLogDto.fromEntity(record);
  }

  @Get(':assetId/scans')
  @ApiOperation({ summary: 'Retrieve the scan history for an asset' })
  @ApiOkResponse({ type: AssetScanLogDto, isArray: true })
  async listAssetScans(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<AssetScanLogDto[]> {
    const records = await this.assetsService.listAssetScans(assetId, user);
    return records.map((record) => AssetScanLogDto.fromEntity(record));
  }
}
