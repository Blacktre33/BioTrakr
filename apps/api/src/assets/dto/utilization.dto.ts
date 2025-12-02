import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UtilizationSummaryDto {
  @ApiProperty({ description: 'Average utilization percentage across all assets' })
  averageUtilization: number;

  @ApiProperty({ description: 'Total usage hours across all assets' })
  totalUsageHours: number;

  @ApiProperty({ description: 'Number of assets with usage data' })
  activeAssetsCount: number;

  @ApiProperty({ description: 'Total number of assets' })
  totalAssetsCount: number;

  @ApiProperty({ description: 'Peak utilization hour (0-23)' })
  peakUtilizationHour: number;

  @ApiProperty({ description: 'Peak utilization day of week (0-6, Sunday=0)' })
  peakUtilizationDay: number;

  @ApiProperty({ description: 'Total number of usage sessions' })
  totalSessions: number;

  @ApiProperty({ description: 'Average session duration in minutes' })
  averageSessionDuration: number;
}

export class AssetUtilizationDto {
  @ApiProperty({ description: 'Asset ID' })
  assetId: string;

  @ApiProperty({ description: 'Asset tag number' })
  assetTag: string;

  @ApiProperty({ description: 'Equipment name' })
  equipmentName: string;

  @ApiProperty({ description: 'Device category' })
  category: string;

  @ApiProperty({ description: 'Utilization percentage' })
  utilizationPercentage: number;

  @ApiProperty({ description: 'Total usage hours' })
  usageHours: number;

  @ApiProperty({ description: 'Number of usage sessions' })
  sessionCount: number;

  @ApiProperty({ description: 'Average session duration in minutes' })
  averageSessionDuration: number;

  @ApiProperty({ description: 'Last usage timestamp' })
  lastUsedAt: Date | null;

  @ApiProperty({ description: 'Idle time in hours (since last use)' })
  idleTimeHours: number | null;

  @ApiPropertyOptional({ description: 'Department name' })
  departmentName?: string | null;
}

export class CategoryUtilizationDto {
  @ApiProperty({ description: 'Asset category' })
  category: string;

  @ApiProperty({ description: 'Average utilization percentage' })
  averageUtilization: number;

  @ApiProperty({ description: 'Total usage hours' })
  totalUsageHours: number;

  @ApiProperty({ description: 'Number of assets in category' })
  assetCount: number;

  @ApiProperty({ description: 'Total number of sessions' })
  sessionCount: number;
}

export class DepartmentUtilizationDto {
  @ApiProperty({ description: 'Department ID' })
  departmentId: string;

  @ApiProperty({ description: 'Department name' })
  departmentName: string;

  @ApiProperty({ description: 'Average utilization percentage' })
  averageUtilization: number;

  @ApiProperty({ description: 'Total usage hours' })
  totalUsageHours: number;

  @ApiProperty({ description: 'Number of assets used' })
  assetCount: number;

  @ApiProperty({ description: 'Total number of sessions' })
  sessionCount: number;
}

export class UtilizationTrendDto {
  @ApiProperty({ description: 'Date/time period' })
  date: string;

  @ApiProperty({ description: 'Average utilization percentage' })
  utilization: number;

  @ApiProperty({ description: 'Total usage hours' })
  usageHours: number;

  @ApiProperty({ description: 'Number of active assets' })
  activeAssets: number;

  @ApiProperty({ description: 'Number of sessions' })
  sessions: number;
}

export class IdleAssetDto {
  @ApiProperty({ description: 'Asset ID' })
  assetId: string;

  @ApiProperty({ description: 'Asset tag number' })
  assetTag: string;

  @ApiProperty({ description: 'Equipment name' })
  equipmentName: string;

  @ApiProperty({ description: 'Device category' })
  category: string;

  @ApiProperty({ description: 'Current utilization percentage' })
  utilizationPercentage: number;

  @ApiProperty({ description: 'Days since last use' })
  daysSinceLastUse: number;

  @ApiProperty({ description: 'Last usage timestamp' })
  lastUsedAt: Date | null;

  @ApiPropertyOptional({ description: 'Department name' })
  departmentName?: string | null;
}

export class AssetUtilizationDetailsDto {
  @ApiProperty({ description: 'Asset ID' })
  assetId: string;

  @ApiProperty({ description: 'Asset tag number' })
  assetTag: string;

  @ApiProperty({ description: 'Equipment name' })
  equipmentName: string;

  @ApiProperty({ description: 'Overall utilization percentage' })
  utilizationPercentage: number;

  @ApiProperty({ description: 'Total usage hours' })
  totalUsageHours: number;

  @ApiProperty({ description: 'Number of sessions' })
  sessionCount: number;

  @ApiProperty({ description: 'Average session duration in minutes' })
  averageSessionDuration: number;

  @ApiProperty({ description: 'Peak usage hour (0-23)' })
  peakUsageHour: number;

  @ApiProperty({ description: 'Peak usage day of week (0-6)' })
  peakUsageDay: number;

  @ApiProperty({ description: 'Last usage timestamp' })
  lastUsedAt: Date | null;

  @ApiProperty({ description: 'Utilization trends over time' })
  trends: UtilizationTrendDto[];
}

