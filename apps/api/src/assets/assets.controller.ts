import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';

import { AssetsService } from './assets.service';
import { CreateAssetScanDto } from './dto/create-asset-scan.dto';
import { AssetScanLogDto } from './dto/asset-scan-log.dto';
import { CreateAssetDto, UpdateAssetDto } from './dto/create-asset.dto';

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new asset' })
  @ApiCreatedResponse({ description: 'The asset has been successfully created.' })
  async create(@Body() createAssetDto: CreateAssetDto) {
    return this.assetsService.create(createAssetDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all assets with pagination' })
  @ApiOkResponse({ description: 'List of assets' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  async findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.assetsService.findAll({
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 20,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single asset by ID' })
  @ApiOkResponse({ description: 'The asset details' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    const asset = await this.assetsService.findOne(id);
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    return asset;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing asset' })
  @ApiOkResponse({ description: 'The updated asset' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateAssetDto: UpdateAssetDto,
  ) {
    return this.assetsService.update(id, updateAssetDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an asset' })
  @ApiOkResponse({ description: 'The deleted asset' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assetsService.remove(id);
  }

  @Post(':assetId/scans')
  @HttpCode(201)
  @ApiOperation({ summary: 'Record a QR scan for an asset' })
  @ApiCreatedResponse({ type: AssetScanLogDto })
  async createAssetScan(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() payload: CreateAssetScanDto,
  ): Promise<AssetScanLogDto> {
    // Delegate to the service so validation / persistence logic stays centralised.
    const record = await this.assetsService.createAssetScan(assetId, payload);

    return AssetScanLogDto.fromEntity(record);
  }

  @Get(':assetId/scans')
  @ApiOperation({ summary: 'Retrieve the scan history for an asset' })
  @ApiOkResponse({ type: AssetScanLogDto, isArray: true })
  async listAssetScans(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ): Promise<AssetScanLogDto[]> {
    // Map the Prisma entity into a DTO so Swagger output matches the response contract.
    const records = await this.assetsService.listAssetScans(assetId);

    return records.map((record) => AssetScanLogDto.fromEntity(record));
  }
}
