import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisposalMethod } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { REASON_KEYS, type CondemnationReason } from './condemnation';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CondemnationQuery {
  @ApiProperty({ description: 'The device' })
  @IsUUID()
  assetId!: string;
}

export class ProposeCondemnationDto {
  @ApiProperty()
  @IsUUID()
  assetId!: string;

  @ApiProperty({ enum: REASON_KEYS, isArray: true })
  @IsArray()
  @ArrayMinSize(1, { message: 'Give at least one reason' })
  @ArrayMaxSize(REASON_KEYS.length)
  @ArrayUnique()
  @IsIn(REASON_KEYS, { each: true })
  reasons!: CondemnationReason[];

  @ApiProperty({
    description: "Why: the fault, the vendor's advice, what a repair needs",
  })
  @Transform(trim)
  @IsString()
  @MinLength(20, {
    message: 'Explain why the device should be condemned (a sentence or two)',
  })
  @MaxLength(4000)
  justification!: string;

  @ApiPropertyOptional({ description: 'What a repair would cost (INR)' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter an amount in rupees' })
  @Min(0)
  @Max(9_999_999_999)
  @IsOptional()
  repairEstimate?: number;

  @ApiPropertyOptional({
    description: 'What the device is worth now (INR); book value if unknown',
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter an amount in rupees' })
  @Min(0)
  @Max(9_999_999_999)
  @IsOptional()
  currentValue?: number;
}

export class DecideCondemnationDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiProperty({
    description: 'The committee meeting: its date and minute number',
    example: 'Equipment committee, 14 Oct 2026, minute 6',
  })
  @Transform(trim)
  @IsString()
  @MinLength(5, {
    message: 'Name the committee meeting: its date and minute number',
  })
  @MaxLength(500)
  committee!: string;

  @ApiPropertyOptional({ description: 'Needed when the committee rejects it' })
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  note?: string;
}

export class WithdrawCondemnationDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Say why it is withdrawn' })
  @MaxLength(1000)
  reason!: string;
}

export class DisposeCondemnationDto {
  @ApiProperty({ enum: DisposalMethod })
  @IsEnum(DisposalMethod)
  method!: DisposalMethod;

  @ApiProperty({ example: '2026-10-20' })
  @IsDateString({}, { message: 'Enter the date it left the hospital' })
  disposedOn!: string;

  @ApiProperty({
    description:
      'Who took it, and the e-waste certificate, receipt or transfer order number',
  })
  @Transform(trim)
  @IsString()
  @MinLength(5, {
    message: 'Say who took it, and the certificate or receipt number',
  })
  @MaxLength(4000)
  note!: string;

  @ApiPropertyOptional({
    description:
      'AERB decommissioning approval or PC-PNDT NOC: reference and date',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  clearance?: string;
}
