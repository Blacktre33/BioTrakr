import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FailureCategory, WorkOrderStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReportProblemDto {
  @ApiProperty()
  @IsUUID()
  assetId!: string;

  @ApiProperty({ description: 'What is wrong, in the reporter’s words' })
  @IsString()
  @MinLength(5, { message: 'Describe the problem in a few words' })
  @MaxLength(2000)
  description!: string;

  @ApiProperty({
    description:
      'Take the device out of use now (it shows as "Do not use" when scanned)',
  })
  @IsBoolean()
  takeOutOfUse!: boolean;

  @ApiPropertyOptional({ description: 'Where the device is now' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  locationHint?: string;
}

export const WORK_ORDER_VIEWS = ['open', 'mine', 'done'] as const;
export type WorkOrderView = (typeof WORK_ORDER_VIEWS)[number];

export class ListWorkOrdersQuery {
  @ApiPropertyOptional({ enum: WORK_ORDER_VIEWS, default: 'open' })
  @IsIn(WORK_ORDER_VIEWS)
  @IsOptional()
  view?: WorkOrderView;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  assetId?: string;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  skip?: number;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  take?: number;
}

export class UpdateWorkOrderDto {
  @ApiProperty({
    enum: WorkOrderStatus,
    description:
      'The status you saw; the update is refused if it has changed since',
  })
  @IsEnum(WorkOrderStatus)
  expectedStatus!: WorkOrderStatus;

  @ApiPropertyOptional({ enum: WorkOrderStatus })
  @IsEnum(WorkOrderStatus)
  @IsOptional()
  status?: WorkOrderStatus;

  @ApiPropertyOptional({
    description:
      'Technician to assign; must be biomed staff in your organization',
  })
  @IsUUID()
  @IsOptional()
  assignedTechnicianId?: string;

  @ApiPropertyOptional({
    description: 'What was done (required to complete) or why it was cancelled',
  })
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  workPerformed?: string;

  @ApiPropertyOptional({ enum: FailureCategory })
  @IsEnum(FailureCategory)
  @IsOptional()
  failureCategory?: FailureCategory;

  @ApiPropertyOptional({
    description:
      'On completion, put a quarantined / in-maintenance device back into use',
  })
  @IsBoolean()
  @IsOptional()
  releaseDevice?: boolean;

  @ApiPropertyOptional({
    description:
      'Required with releaseDevice: the device is safe to use on patients',
  })
  @IsBoolean()
  @IsOptional()
  confirmSafe?: boolean;
}
