import {
  IsString,
  IsNumber,
  IsUUID,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsObject,
  ValidateNested,
  Min,
  Max,
  IsDateString,
  IsArray,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EventSeverity,
  HealthStatus,
  LabelSource,
  FailureType,
  EventCategory,
  AssetCategory,
  SourceType,
} from '../enums';

// ============================================================================
// ML Labels DTO (from labeling guide)
// ============================================================================

export class MLLabelsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  healthScore?: number;

  @IsOptional()
  @IsEnum(HealthStatus)
  healthStatus?: HealthStatus;

  @IsOptional()
  @IsBoolean()
  anomalyDetected?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  failureProbability?: number;

  @IsOptional()
  @IsEnum(FailureType)
  predictedFailureType?: FailureType;

  @IsOptional()
  @IsNumber()
  timeToFailureHours?: number;
}

export class LabelMetadataDto {
  @IsOptional()
  @IsEnum(LabelSource)
  labelSource?: LabelSource;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  labelConfidence?: number;

  @IsOptional()
  @IsString()
  modelVersion?: string;
}

// ============================================================================
// Core Telemetry Event DTO
// ============================================================================

export class TelemetryEventDto {
  // Naming convention: domain.entity.action.metric_type
  @IsString()
  name: string;

  // Standard tags (required)
  @IsDateString()
  timestamp: string;

  @IsUUID()
  facilityId: string;

  @IsUUID()
  assetId: string;

  @IsString()
  environment: string;

  @IsString()
  serviceName: string;

  @IsOptional()
  @IsString()
  traceId?: string;

  // Categorization (required)
  @IsString()
  assetCategory: string;

  @IsString()
  assetType: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsEnum(EventCategory)
  eventCategory: EventCategory;

  @IsEnum(EventSeverity)
  severity: EventSeverity;

  // Measurement
  @IsNumber()
  value: number;

  @IsString()
  unit: string;

  // ML labels (optional)
  @IsOptional()
  @ValidateNested()
  @Type(() => MLLabelsDto)
  labels?: MLLabelsDto;

  // Label metadata (optional)
  @IsOptional()
  @ValidateNested()
  @Type(() => LabelMetadataDto)
  labelMetadata?: LabelMetadataDto;

  // Raw payload for debugging
  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, any>;
}

// ============================================================================
// RTLS Event DTO
// ============================================================================

export class CoordinatesDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsOptional()
  @IsNumber()
  z?: number;
}

export class RTLSEventDto {
  @IsDateString()
  timestamp: string;

  @IsUUID()
  assetId: string;

  @IsUUID()
  facilityId: string;

  // Location
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  building?: string;

  // Coordinates
  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates?: CoordinatesDto;

  // Signal data
  @IsOptional()
  @IsNumber()
  signalStrengthDbm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsNumber()
  accuracyMeters?: number;

  // Source
  @IsString()
  tagId: string;

  @IsOptional()
  @IsString()
  readerId?: string;

  @IsEnum(SourceType)
  sourceType: SourceType;

  // Event type
  @IsString()
  eventType: string; // 'position_update', 'zone_entry', etc.

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, any>;
}

// ============================================================================
// Maintenance Event DTO
// ============================================================================

export class MaintenanceEventDto {
  @IsDateString()
  timestamp: string;

  @IsUUID()
  assetId: string;

  @IsUUID()
  facilityId: string;

  @IsOptional()
  @IsUUID()
  workOrderId?: string;

  // Event details
  @IsString()
  eventType: string;

  @IsOptional()
  @IsString()
  maintenanceType?: string;

  // Failure data (for ML training)
  @IsOptional()
  @IsBoolean()
  failureOccurred?: boolean;

  @IsOptional()
  @IsEnum(FailureType)
  failureType?: FailureType;

  @IsOptional()
  @IsString()
  failureCode?: string;

  @IsOptional()
  @IsString()
  rootCause?: string;

  // Resolution
  @IsOptional()
  @IsArray()
  partsReplaced?: Array<{
    partNumber: string;
    partName: string;
    quantity: number;
  }>;

  @IsOptional()
  @IsNumber()
  laborHours?: number;

  @IsOptional()
  @IsNumber()
  downtimeHours?: number;

  @IsOptional()
  @IsNumber()
  cost?: number;

  // Personnel
  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, any>;
}

// ============================================================================
// Error Event DTO
// ============================================================================

export class ErrorEventDto {
  @IsDateString()
  timestamp: string;

  @IsUUID()
  assetId: string;

  @IsUUID()
  facilityId: string;

  // Error details
  @IsString()
  errorCode: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsString()
  errorCategory?: string;

  @IsEnum(EventSeverity)
  severity: EventSeverity;

  // Context
  @IsOptional()
  @IsString()
  component?: string;

  @IsOptional()
  @IsString()
  operation?: string;

  // State at time of error
  @IsOptional()
  @IsObject()
  sensorReadings?: Record<string, number>;

  // Resolution
  @IsOptional()
  @IsBoolean()
  autoRecovered?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresIntervention?: boolean;

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, any>;
}

// ============================================================================
// Batch Ingestion DTOs
// ============================================================================

export class BatchTelemetryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TelemetryEventDto)
  events: TelemetryEventDto[];
}

export class BatchRTLSDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RTLSEventDto)
  events: RTLSEventDto[];
}

export class BatchMaintenanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MaintenanceEventDto)
  events: MaintenanceEventDto[];
}

// ============================================================================
// Response DTOs
// ============================================================================

export class IngestionResponseDto {
  success: boolean;
  processed: number;
  failed: number;
  errors?: Array<{
    index: number;
    message: string;
  }>;
  traceId?: string;
}

export class ValidationErrorDto {
  field: string;
  message: string;
  value?: any;
}
