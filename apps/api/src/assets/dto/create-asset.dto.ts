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
  IsInt,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AppliedPartType,
  AssetStatus,
  DeviceCategory,
  CriticalityLevel,
  ElectricalClass,
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

  @ApiProperty({
    description: 'Manufacturer Name',
    example: 'General Electric',
  })
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

  @ApiProperty({
    enum: AssetStatus,
    description: 'Current Status',
    default: AssetStatus.ACTIVE,
  })
  @IsEnum(AssetStatus)
  @IsOptional()
  assetStatus?: AssetStatus;

  @ApiProperty({ enum: CriticalityLevel, description: 'Criticality Level' })
  @IsEnum(CriticalityLevel)
  criticalityLevel: CriticalityLevel;

  @ApiProperty({ enum: RiskClassification, description: 'Risk Classification' })
  @IsEnum(RiskClassification)
  riskClassification: RiskClassification;

  @ApiProperty({
    description: 'Purchase Date',
    example: '2024-01-15T00:00:00Z',
  })
  @IsDateString()
  purchaseDate: string;

  @ApiProperty({ description: 'Purchase Cost', example: 1500000.0 })
  @IsNumber()
  @Min(0)
  purchaseCost: number;

  @ApiProperty({ description: 'Useful Life in Years', example: 10 })
  @IsNumber()
  @Min(1)
  usefulLifeYears: number;

  // organizationId is taken from the caller's access token, never the request body.

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

  @ApiPropertyOptional({
    description: 'AMC Start Date',
    example: '2024-01-15T00:00:00Z',
  })
  @IsDateString()
  @IsOptional()
  amcStartDate?: string;

  @ApiPropertyOptional({
    description: 'AMC End Date',
    example: '2025-01-15T00:00:00Z',
  })
  @IsDateString()
  @IsOptional()
  amcEndDate?: string;

  @ApiPropertyOptional({
    description: 'Current Annual AMC Cost',
    example: 50000.0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  amcCostAnnual?: number;

  @ApiPropertyOptional({
    description: 'Initial AMC Cost (First Year)',
    example: 45000.0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  amcInitialCost?: number;

  @ApiPropertyOptional({
    description: 'Number of Years AMC Has Been Paid',
    example: 3,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  amcYearsPaid?: number;

  @ApiPropertyOptional({
    description: 'AMC Cost Increase Amount',
    example: 5000.0,
  })
  @IsNumber()
  @IsOptional()
  amcIncreaseAmount?: number;

  @ApiPropertyOptional({
    description: 'AMC Cost Increase Percentage',
    example: 11.11,
  })
  @IsNumber()
  @IsOptional()
  amcIncreasePercentage?: number;

  @ApiPropertyOptional({ description: 'CMC Contract Number' })
  @IsString()
  @IsOptional()
  cmcContractNumber?: string;

  @ApiPropertyOptional({
    description: 'CMC Start Date',
    example: '2024-01-15T00:00:00Z',
  })
  @IsDateString()
  @IsOptional()
  cmcStartDate?: string;

  @ApiPropertyOptional({
    description: 'CMC End Date',
    example: '2025-01-15T00:00:00Z',
  })
  @IsDateString()
  @IsOptional()
  cmcEndDate?: string;

  @ApiPropertyOptional({
    description: 'Current Annual CMC Cost',
    example: 75000.0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  cmcCostAnnual?: number;

  @ApiPropertyOptional({
    description: 'Initial CMC Cost (First Year)',
    example: 70000.0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  cmcInitialCost?: number;

  @ApiPropertyOptional({
    description: 'Number of Years CMC Has Been Paid',
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  cmcYearsPaid?: number;

  @ApiPropertyOptional({
    description: 'CMC Cost Increase Amount',
    example: 5000.0,
  })
  @IsNumber()
  @IsOptional()
  cmcIncreaseAmount?: number;

  @ApiPropertyOptional({
    description: 'CMC Cost Increase Percentage',
    example: 7.14,
  })
  @IsNumber()
  @IsOptional()
  cmcIncreasePercentage?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Days between preventive maintenance visits; schedules the first PM',
    example: 180,
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  pmFrequencyDays?: number;

  @ApiPropertyOptional({
    description: 'When the last PM was done (from the service sticker)',
  })
  @IsDateString()
  @IsOptional()
  lastPmDate?: string;

  @ApiPropertyOptional({
    description:
      'The device needs periodic calibration; the schedule opens calibration work orders',
  })
  @IsBoolean()
  @IsOptional()
  requiresCalibration?: boolean;

  @ApiPropertyOptional({
    description:
      'Days between calibrations when a certificate gives no due date (default 365)',
    example: 365,
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  calibrationFrequencyDays?: number;

  @ApiPropertyOptional({
    description:
      'When the current calibration expires (certificate or sticker). Without it, a device that needs calibration is due now.',
  })
  @IsDateString()
  @IsOptional()
  nextCalibrationDue?: string;

  @ApiPropertyOptional({
    description:
      'The device needs periodic electrical safety tests (IS/IEC 62353); the schedule opens test work orders',
  })
  @IsBoolean()
  @IsOptional()
  requiresSafetyTest?: boolean;

  @ApiPropertyOptional({
    description: 'Days between electrical safety tests (default 365)',
    example: 365,
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  safetyTestFrequencyDays?: number;

  @ApiPropertyOptional({
    description:
      'When the next electrical safety test is due (from the last test sticker). Without it, a device that needs testing is due now.',
  })
  @IsDateString()
  @IsOptional()
  nextSafetyInspectionDue?: string;

  @ApiPropertyOptional({
    enum: ElectricalClass,
    description: 'Protection class, from the rating plate',
  })
  @IsEnum(ElectricalClass)
  @IsOptional()
  electricalClass?: ElectricalClass;

  @ApiPropertyOptional({
    enum: AppliedPartType,
    description: 'Type of the parts that touch the patient (B, BF or CF)',
  })
  @IsEnum(AppliedPartType)
  @IsOptional()
  appliedPartType?: AppliedPartType;
}

/**
 * Editable details. Status is not here: it changes only through
 * POST /assets/:id/status, which requires a reason and records history.
 */
export class UpdateAssetDto {
  @ApiPropertyOptional({ description: 'Equipment Name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  equipmentName?: string;

  @ApiPropertyOptional({ description: 'Manufacturer Name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  manufacturer?: string;

  @ApiPropertyOptional({ description: 'Model Number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  modelNumber?: string;

  @ApiPropertyOptional({ description: 'Serial Number' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  serialNumber?: string;

  @ApiPropertyOptional({ enum: DeviceCategory })
  @IsEnum(DeviceCategory)
  @IsOptional()
  deviceCategory?: DeviceCategory;

  @ApiPropertyOptional({ enum: CriticalityLevel })
  @IsEnum(CriticalityLevel)
  @IsOptional()
  criticalityLevel?: CriticalityLevel;

  @ApiPropertyOptional({ enum: RiskClassification })
  @IsEnum(RiskClassification)
  @IsOptional()
  riskClassification?: RiskClassification;

  @ApiPropertyOptional({ description: 'Current Facility ID' })
  @IsUUID()
  @IsOptional()
  currentFacilityId?: string;

  @ApiPropertyOptional({ description: 'Current Room ID' })
  @IsUUID()
  @IsOptional()
  currentRoomId?: string;

  @ApiPropertyOptional({ description: 'Custodian Department ID' })
  @IsUUID()
  @IsOptional()
  custodianDepartmentId?: string;

  @ApiPropertyOptional({ description: 'Primary Custodian User ID' })
  @IsUUID()
  @IsOptional()
  primaryCustodianId?: string;

  @ApiPropertyOptional({
    description: 'Days between preventive maintenance visits',
    example: 180,
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  pmFrequencyDays?: number;

  @ApiPropertyOptional({
    description:
      'The device needs periodic calibration. Turning it on with no due date makes calibration due now.',
  })
  @IsBoolean()
  @IsOptional()
  requiresCalibration?: boolean;

  @ApiPropertyOptional({
    description:
      'Days between calibrations when a certificate gives no due date; applies from the next calibration',
    example: 365,
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  calibrationFrequencyDays?: number;

  @ApiPropertyOptional({
    description: 'When calibration is next due (e.g. from the certificate)',
  })
  @IsDateString()
  @IsOptional()
  nextCalibrationDue?: string;

  @ApiPropertyOptional({
    description:
      'The device needs periodic electrical safety tests. Turning it on with no due date makes a test due now.',
  })
  @IsBoolean()
  @IsOptional()
  requiresSafetyTest?: boolean;

  @ApiPropertyOptional({
    description:
      'Days between electrical safety tests; applies from the next test',
    example: 365,
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  safetyTestFrequencyDays?: number;

  @ApiPropertyOptional({
    description: 'When the next electrical safety test is due',
  })
  @IsDateString()
  @IsOptional()
  nextSafetyInspectionDue?: string;

  @ApiPropertyOptional({ enum: ElectricalClass })
  @IsEnum(ElectricalClass)
  @IsOptional()
  electricalClass?: ElectricalClass;

  @ApiPropertyOptional({ enum: AppliedPartType })
  @IsEnum(AppliedPartType)
  @IsOptional()
  appliedPartType?: AppliedPartType;

  @ApiPropertyOptional({ description: 'Useful Life in Years', example: 10 })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  usefulLifeYears?: number;

  @ApiPropertyOptional({ description: 'Warranty end date' })
  @IsDateString()
  @IsOptional()
  warrantyEndDate?: string;

  @ApiPropertyOptional({ description: 'UDI Device Identifier' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  udiDeviceIdentifier?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  notes?: string;
}

export class ChangeAssetStatusDto {
  @ApiProperty({ enum: AssetStatus })
  @IsEnum(AssetStatus)
  status!: AssetStatus;

  @ApiProperty({
    description: 'Why the status is changing; kept in the device history',
    example: 'Repaired flow sensor and passed electrical safety test',
  })
  @IsString()
  @MaxLength(1000)
  reason!: string;

  @ApiProperty({
    enum: AssetStatus,
    description:
      'The status you saw; the change is refused if it has changed since',
  })
  @IsEnum(AssetStatus)
  expectedStatus!: AssetStatus;

  @ApiPropertyOptional({
    description:
      'Required when putting a device back into use: it has been checked and is safe to use on patients',
  })
  @IsBoolean()
  @IsOptional()
  confirmSafe?: boolean;
}
