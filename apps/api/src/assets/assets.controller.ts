import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AssetsService } from './assets.service';
import { CreateAssetScanDto } from './dto/create-asset-scan.dto';
import { AssetScanLogDto } from './dto/asset-scan-log.dto';

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

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
