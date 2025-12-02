import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsDateString,
  IsBoolean,
  Min,
} from 'class-validator';
import {
  AssetStatus,
  DeviceCategory,
  CriticalityLevel,
  RiskClassification,
} from '@prisma/client';

export class CreateAssetDto {
  @ApiProperty({ description: 'Asset Tag Number', example: 'BME-2024-001' })
  @IsString()
  @IsNotEmpty()
  assetTagNumber: string;

  @ApiProperty({ description: 'Equipment Name', example: 'GE Optima MR360' })
  @IsString()
  @IsNotEmpty()
  equipmentName: string;

  @ApiProperty({ description: 'Manufacturer Name', example: 'General Electric' })
  @IsString()
  @IsNotEmpty()
  manufacturer: string;

  @ApiProperty({ description: 'Model Number', example: 'Optima MR360' })
  @IsString()
  @IsNotEmpty()
  modelNumber: string;

  @ApiProperty({ description: 'Serial Number', example: 'SN123456789' })
  @IsString()
  @IsNotEmpty()
  serialNumber: string;

  @ApiProperty({ enum: DeviceCategory, description: 'Device Category' })
  @IsEnum(DeviceCategory)
  deviceCategory: DeviceCategory;

  @ApiProperty({ enum: AssetStatus, description: 'Current Status', default: AssetStatus.ACTIVE })
  @IsEnum(AssetStatus)
  @IsOptional()
  assetStatus?: AssetStatus;

  @ApiProperty({ enum: CriticalityLevel, description: 'Criticality Level' })
  @IsEnum(CriticalityLevel)
  criticalityLevel: CriticalityLevel;

  @ApiProperty({ enum: RiskClassification, description: 'Risk Classification' })
  @IsEnum(RiskClassification)
  riskClassification: RiskClassification;

  @ApiProperty({ description: 'Purchase Date', example: '2024-01-15T00:00:00Z' })
  @IsDateString()
  purchaseDate: string;

  @ApiProperty({ description: 'Purchase Cost', example: 1500000.00 })
  @IsNumber()
  @Min(0)
  purchaseCost: number;

  @ApiProperty({ description: 'Useful Life in Years', example: 10 })
  @IsNumber()
  @Min(1)
  usefulLifeYears: number;

  @ApiProperty({ description: 'Organization ID' })
  @IsUUID()
  organizationId: string;

  @ApiProperty({ description: 'Current Facility ID' })
  @IsUUID()
  currentFacilityId: string;

  @ApiProperty({ description: 'Primary Custodian User ID' })
  @IsUUID()
  primaryCustodianId: string;

  @ApiProperty({ description: 'Custodian Department ID' })
  @IsUUID()
  custodianDepartmentId: string;

  @ApiPropertyOptional({ description: 'UDI Device Identifier' })
  @IsString()
  @IsOptional()
  udiDeviceIdentifier?: string;

  @ApiPropertyOptional({ description: 'AMC Contract Number' })
  @IsString()
  @IsOptional()
  amcContractNumber?: string;

  @ApiPropertyOptional({ description: 'AMC Start Date', example: '2024-01-15T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  amcStartDate?: string;

  @ApiPropertyOptional({ description: 'AMC End Date', example: '2025-01-15T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  amcEndDate?: string;

  @ApiPropertyOptional({ description: 'Current Annual AMC Cost', example: 50000.00 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  amcCostAnnual?: number;

  @ApiPropertyOptional({ description: 'Initial AMC Cost (First Year)', example: 45000.00 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  amcInitialCost?: number;

  @ApiPropertyOptional({ description: 'Number of Years AMC Has Been Paid', example: 3 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  amcYearsPaid?: number;

  @ApiPropertyOptional({ description: 'AMC Cost Increase Amount', example: 5000.00 })
  @IsNumber()
  @IsOptional()
  amcIncreaseAmount?: number;

  @ApiPropertyOptional({ description: 'AMC Cost Increase Percentage', example: 11.11 })
  @IsNumber()
  @IsOptional()
  amcIncreasePercentage?: number;

  @ApiPropertyOptional({ description: 'CMC Contract Number' })
  @IsString()
  @IsOptional()
  cmcContractNumber?: string;

  @ApiPropertyOptional({ description: 'CMC Start Date', example: '2024-01-15T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  cmcStartDate?: string;

  @ApiPropertyOptional({ description: 'CMC End Date', example: '2025-01-15T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  cmcEndDate?: string;

  @ApiPropertyOptional({ description: 'Current Annual CMC Cost', example: 75000.00 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  cmcCostAnnual?: number;

  @ApiPropertyOptional({ description: 'Initial CMC Cost (First Year)', example: 70000.00 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  cmcInitialCost?: number;

  @ApiPropertyOptional({ description: 'Number of Years CMC Has Been Paid', example: 2 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  cmcYearsPaid?: number;

  @ApiPropertyOptional({ description: 'CMC Cost Increase Amount', example: 5000.00 })
  @IsNumber()
  @IsOptional()
  cmcIncreaseAmount?: number;

  @ApiPropertyOptional({ description: 'CMC Cost Increase Percentage', example: 7.14 })
  @IsNumber()
  @IsOptional()
  cmcIncreasePercentage?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateAssetDto {
  @ApiPropertyOptional({ description: 'Equipment Name' })
  @IsString()
  @IsOptional()
  equipmentName?: string;

  @ApiPropertyOptional({ description: 'Manufacturer Name' })
  @IsString()
  @IsOptional()
  manufacturer?: string;

  @ApiPropertyOptional({ description: 'Model Number' })
  @IsString()
  @IsOptional()
  modelNumber?: string;

  @ApiPropertyOptional({ description: 'Serial Number' })
  @IsString()
  @IsOptional()
  serialNumber?: string;

  @ApiPropertyOptional({ enum: AssetStatus, description: 'Current Status' })
  @IsEnum(AssetStatus)
  @IsOptional()
  assetStatus?: AssetStatus;

  @ApiPropertyOptional({ description: 'Current Facility ID' })
  @IsUUID()
  @IsOptional()
  currentFacilityId?: string;

  @ApiPropertyOptional({ description: 'Current Room ID' })
  @IsUUID()
  @IsOptional()
  currentRoomId?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

