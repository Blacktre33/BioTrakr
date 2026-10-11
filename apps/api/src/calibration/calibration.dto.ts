import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CalibrationResult, ServiceProvider } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * A calibration as stated on its certificate or, when done in-house, as
 * recorded by the technician. Which fields are required depends on who did
 * it (see calibrationProblems).
 */
export class CalibrationInputDto {
  @ApiProperty({ description: 'When the device was calibrated' })
  @IsDateString()
  calibratedAt!: string;

  @ApiProperty({ enum: ServiceProvider })
  @IsEnum(ServiceProvider)
  provider!: ServiceProvider;

  @ApiPropertyOptional({
    description: 'The laboratory or vendor (required unless in-house)',
  })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  providerName?: string;

  @ApiPropertyOptional({
    description: "The laboratory's NABL accreditation certificate number",
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  labAccreditationNumber?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  certificateNumber?: string;

  @ApiPropertyOptional({
    description:
      'When the certificate says the next calibration is due; otherwise the device’s interval applies',
  })
  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @ApiPropertyOptional({
    description: 'As stated on the certificate, e.g. "±0.5 mmHg (k=2)"',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  measurementUncertainty?: string;

  @ApiPropertyOptional({
    description:
      'Reference equipment used and its own calibration (required in-house)',
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  referenceStandards?: string;

  @ApiProperty({ enum: CalibrationResult })
  @IsEnum(CalibrationResult)
  result!: CalibrationResult;

  @ApiPropertyOptional({
    description: 'Required when the result is FAIL: what was out of tolerance',
  })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;
}

export class CalibrationCorrectionDto extends CalibrationInputDto {
  @ApiProperty({ description: 'Why the record is being corrected' })
  @IsString()
  @MinLength(10, { message: 'Say why the record is being corrected' })
  @MaxLength(1000)
  correctionReason!: string;
}
