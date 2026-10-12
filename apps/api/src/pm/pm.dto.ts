import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PmScheduleQuery {
  @ApiProperty({ description: 'Start of the range (inclusive), ISO date' })
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @ApiProperty({
    description: 'End of the range (exclusive), at most 93 days after from',
  })
  @Type(() => Date)
  @IsDate()
  to!: Date;

  @ApiPropertyOptional({ description: 'Only devices at this facility' })
  @IsUUID()
  @IsOptional()
  facilityId?: string;
}

export class OpenPmWorkOrderDto {
  @ApiProperty()
  @IsUUID()
  assetId!: string;
}

const RESULTS = ['PASS', 'FLAG', 'FAIL', 'NA'] as const;

/** One checklist item as answered. */
export class ChecklistAnswerDto {
  @ApiProperty({ description: "The item's key on the checklist" })
  @IsString()
  @MaxLength(64)
  key!: string;

  @ApiPropertyOptional({
    enum: RESULTS,
    description:
      'Pass, flag (needs attention, still usable), fail (not safe to use) or not applicable. A reading with limits is judged by them.',
  })
  @IsIn(RESULTS)
  @IsOptional()
  result?: (typeof RESULTS)[number];

  @ApiPropertyOptional({ description: 'The measured value, for a reading' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsOptional()
  reading?: number;

  @ApiPropertyOptional({
    description: 'What was found (needed to flag or fail)',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}

/** A completed preventive maintenance checklist. */
export class PmChecklistInputDto {
  @ApiProperty({
    description: 'The checklist used: "builtin:…" or a hospital checklist id',
  })
  @IsString()
  @MaxLength(64)
  checklistKey!: string;

  @ApiPropertyOptional({
    description: 'Analysers and instruments used, with their calibration',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  testEquipment?: string;

  @ApiProperty({ type: [ChecklistAnswerDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ChecklistAnswerDto)
  items!: ChecklistAnswerDto[];
}

/** One item of a hospital's checklist. */
export class ChecklistItemDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9-]{1,64}$/, {
    message: 'Item keys are lower-case letters, digits and hyphens',
  })
  key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  text!: string;

  @ApiProperty({ enum: ['check', 'reading'] })
  @IsIn(['check', 'reading'])
  kind!: 'check' | 'reading';

  @ApiPropertyOptional({ example: 'mmHg' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ description: 'A reading below this fails' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsOptional()
  min?: number;

  @ApiPropertyOptional({ description: 'A reading above this fails' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsOptional()
  max?: number;
}

export class ChecklistInputDto {
  @ApiProperty({ example: 'Philips IntelliVue monitor' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    type: [String],
    description: "Words in a device's name that pick this checklist",
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  keywords!: string[];

  @ApiProperty({ type: [ChecklistItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items!: ChecklistItemDto[];
}

export class UpdateChecklistDto extends ChecklistInputDto {
  @ApiPropertyOptional({ description: 'false retires it: no longer offered' })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class ChecklistQuery {
  @ApiPropertyOptional({
    description: 'Also say which checklist suits this device',
  })
  @IsUUID()
  @IsOptional()
  assetId?: string;
}
