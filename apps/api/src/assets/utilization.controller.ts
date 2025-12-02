import { Controller, Get, Query, Param, ParseUUIDPipe, ParseEnumPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { UtilizationService } from './utilization.service';
import {
  UtilizationSummaryDto,
  AssetUtilizationDto,
  CategoryUtilizationDto,
  DepartmentUtilizationDto,
  UtilizationTrendDto,
  IdleAssetDto,
  AssetUtilizationDetailsDto,
} from './dto/utilization.dto';

@ApiTags('utilization')
@Controller('v1/assets/utilization')
export class UtilizationController {
  constructor(private readonly utilizationService: UtilizationService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get overall utilization summary metrics' })
  @ApiOkResponse({ type: UtilizationSummaryDto })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Start date (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'End date (ISO 8601)' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filter by asset category' })
  @ApiQuery({ name: 'departmentId', required: false, type: String, description: 'Filter by department ID' })
  @ApiQuery({ name: 'facilityId', required: false, type: String, description: 'Filter by facility ID' })
  async getSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
    @Query('departmentId') departmentId?: string,
    @Query('facilityId') facilityId?: string,
  ): Promise<UtilizationSummaryDto> {
    return this.utilizationService.getSummary({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      category,
      departmentId,
      facilityId,
    });
  }

  @Get('by-asset')
  @ApiOperation({ summary: 'Get utilization metrics per asset' })
  @ApiOkResponse({ type: AssetUtilizationDto, isArray: true })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'facilityId', required: false, type: String })
  async getByAsset(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
    @Query('departmentId') departmentId?: string,
    @Query('facilityId') facilityId?: string,
  ): Promise<AssetUtilizationDto[]> {
    return this.utilizationService.getByAsset({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      category,
      departmentId,
      facilityId,
    });
  }

  @Get('by-category')
  @ApiOperation({ summary: 'Get utilization metrics by asset category' })
  @ApiOkResponse({ type: CategoryUtilizationDto, isArray: true })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'facilityId', required: false, type: String })
  async getByCategory(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('departmentId') departmentId?: string,
    @Query('facilityId') facilityId?: string,
  ): Promise<CategoryUtilizationDto[]> {
    return this.utilizationService.getByCategory({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      departmentId,
      facilityId,
    });
  }

  @Get('by-department')
  @ApiOperation({ summary: 'Get utilization metrics by department' })
  @ApiOkResponse({ type: DepartmentUtilizationDto, isArray: true })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'facilityId', required: false, type: String })
  async getByDepartment(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('facilityId') facilityId?: string,
  ): Promise<DepartmentUtilizationDto[]> {
    return this.utilizationService.getByDepartment({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      facilityId,
    });
  }

  @Get('trends')
  @ApiOperation({ summary: 'Get utilization trends over time' })
  @ApiOkResponse({ type: UtilizationTrendDto, isArray: true })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'granularity', required: false, enum: ['day', 'week', 'month'], description: 'Time granularity' })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'facilityId', required: false, type: String })
  async getTrends(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: 'day' | 'week' | 'month',
    @Query('category') category?: string,
    @Query('departmentId') departmentId?: string,
    @Query('facilityId') facilityId?: string,
  ): Promise<UtilizationTrendDto[]> {
    return this.utilizationService.getTrends(
      {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        category,
        departmentId,
        facilityId,
      },
      granularity || 'day',
    );
  }

  @Get('idle-assets')
  @ApiOperation({ summary: 'Get assets with low or no utilization' })
  @ApiOkResponse({ type: IdleAssetDto, isArray: true })
  @ApiQuery({ name: 'maxUtilization', required: false, type: Number, description: 'Maximum utilization % (default: 30)' })
  @ApiQuery({ name: 'minDaysIdle', required: false, type: Number, description: 'Minimum days since last use (default: 7)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'facilityId', required: false, type: String })
  async getIdleAssets(
    @Query('maxUtilization') maxUtilization?: string,
    @Query('minDaysIdle') minDaysIdle?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
    @Query('facilityId') facilityId?: string,
  ): Promise<IdleAssetDto[]> {
    return this.utilizationService.getIdleAssets(
      maxUtilization ? parseFloat(maxUtilization) : 30,
      minDaysIdle ? parseFloat(minDaysIdle) : 7,
      {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        category,
        facilityId,
      },
    );
  }

  @Get(':assetId')
  @ApiOperation({ summary: 'Get detailed utilization metrics for a specific asset' })
  @ApiOkResponse({ type: AssetUtilizationDetailsDto })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getAssetDetails(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AssetUtilizationDetailsDto> {
    return this.utilizationService.getAssetDetails(assetId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }
}

