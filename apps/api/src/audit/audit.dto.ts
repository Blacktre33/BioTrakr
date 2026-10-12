import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const AUDIT_ENTITIES = [
  'asset',
  'work_order',
  'calibration',
  'safety_test',
  'contract',
  'vendor',
  'document',
  'facility',
  'department',
  'building',
  'floor',
  'room',
  'user',
  'checklist',
  'pm_checklist',
  'condemnation',
] as const;

export class ListAuditQuery {
  @ApiPropertyOptional({
    description:
      'A device: everything about it (its record, work orders, checks, files)',
  })
  @IsUUID()
  @IsOptional()
  assetId?: string;

  @ApiPropertyOptional({ enum: AUDIT_ENTITIES })
  @IsIn(AUDIT_ENTITIES)
  @IsOptional()
  entityType?: (typeof AUDIT_ENTITIES)[number];

  @ApiPropertyOptional({ description: 'One record (with entityType)' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional({ description: 'From this day' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'To this day, inclusive' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  skip?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  take?: number;
}
