import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrainingAssessment, TrainingKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListTrainingQuery {
  @ApiPropertyOptional({ description: 'Sessions that covered this device' })
  @IsUUID()
  @IsOptional()
  assetId?: string;
}

/** One person, as on the attendance sheet. */
export class AttendeeDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: "Give each attendee's name" })
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Staff nurse' })
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  designation?: string;

  @ApiPropertyOptional({ example: 'ICU' })
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  department?: string;

  @ApiPropertyOptional({ enum: TrainingAssessment })
  @IsEnum(TrainingAssessment)
  @IsOptional()
  assessment?: TrainingAssessment;
}

export class TrainingInputDto {
  @ApiProperty({ example: '2026-10-08' })
  @IsDateString({}, { message: 'Enter the date of the training' })
  heldOn!: string;

  @ApiProperty({ enum: TrainingKind })
  @IsEnum(TrainingKind)
  kind!: TrainingKind;

  @ApiProperty({ example: 'Setting up, alarms and cleaning' })
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Say what the training covered' })
  @MaxLength(300)
  topic!: string;

  @ApiProperty({ example: 'Hamilton C1 ventilators' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Name the equipment' })
  @MaxLength(200)
  equipment!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Name the trainer' })
  @MaxLength(200)
  trainer!: string;

  @ApiPropertyOptional({
    description: "In-house, or the vendor's application specialist",
  })
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  trainerFrom?: string;

  @ApiPropertyOptional({ example: 1.5 })
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Enter the hours, e.g. 1.5' })
  @Min(0.1)
  @Max(99)
  @IsOptional()
  durationHours?: number;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  notes?: string;

  @ApiProperty({ description: 'The particular devices it covered (if any)' })
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  deviceIds!: string[];

  @ApiProperty({ type: [AttendeeDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one attendee' })
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => AttendeeDto)
  attendees!: AttendeeDto[];
}
