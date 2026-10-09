import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssetStatus, CriticalityLevel, DeviceCategory } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const ASSET_SORTS = [
  'tag',
  'name',
  'status',
  'nextPm',
  'updated',
] as const;
export type AssetSort = (typeof ASSET_SORTS)[number];

/** Comma-separated query values ("ACTIVE,IN_SERVICE") become arrays. */
const toList = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : value;

export class ListAssetsQuery {
  @ApiPropertyOptional({
    description: 'Matches tag, name, serial, manufacturer or model',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: AssetStatus, isArray: true })
  @Transform(toList)
  @IsEnum(AssetStatus, { each: true })
  @IsOptional()
  status?: AssetStatus[];

  @ApiPropertyOptional({ enum: DeviceCategory, isArray: true })
  @Transform(toList)
  @IsEnum(DeviceCategory, { each: true })
  @IsOptional()
  category?: DeviceCategory[];

  @ApiPropertyOptional({ enum: CriticalityLevel, isArray: true })
  @Transform(toList)
  @IsEnum(CriticalityLevel, { each: true })
  @IsOptional()
  criticality?: CriticalityLevel[];

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  facilityId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Only devices whose PM is overdue' })
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  @IsOptional()
  pmOverdue?: boolean;

  @ApiPropertyOptional({ enum: ASSET_SORTS, default: 'tag' })
  @IsIn(ASSET_SORTS)
  @IsOptional()
  sort?: AssetSort;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  skip?: number;

  @ApiPropertyOptional({
    default: 25,
    description: 'At most 100 (larger is capped)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  take?: number;
}
