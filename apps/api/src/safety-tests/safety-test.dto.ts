import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AppliedPartType,
  ElectricalClass,
  LeakageMethod,
  SafetyTestReason,
  ServiceProvider,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const reading = (unit: string) => ({
  description: `In ${unit}; leave out what was not measured`,
});

/**
 * An electrical safety test (IS/IEC 62353) as measured. Pass or fail is
 * never sent: the API works it out from the readings and the standard's
 * limits for this class, applied part type and method.
 */
export class SafetyTestInputDto {
  @ApiProperty({ description: 'When the test was done' })
  @IsDateString()
  testedAt!: string;

  @ApiProperty({ enum: SafetyTestReason })
  @IsEnum(SafetyTestReason)
  reason!: SafetyTestReason;

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

  @ApiProperty({
    description:
      'The safety analyser used (make, model, serial) and when it was last calibrated',
  })
  @IsString()
  @MinLength(3, { message: 'Say which safety analyser was used' })
  @MaxLength(300)
  analyzer!: string;

  @ApiProperty({ enum: ElectricalClass })
  @IsEnum(ElectricalClass)
  electricalClass!: ElectricalClass;

  @ApiProperty({ enum: AppliedPartType })
  @IsEnum(AppliedPartType)
  appliedPartType!: AppliedPartType;

  @ApiProperty({ enum: LeakageMethod })
  @IsEnum(LeakageMethod)
  leakageMethod!: LeakageMethod;

  @ApiPropertyOptional({
    description: 'Several items tested as one medical system (earth 0.5 Ω)',
  })
  @IsBoolean()
  @IsOptional()
  medicalSystem?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  mobileXray?: boolean;

  @ApiPropertyOptional({
    description: 'CF applied parts that are defibrillation paddles (100 µA)',
  })
  @IsBoolean()
  @IsOptional()
  defibrillationPaddles?: boolean;

  @ApiProperty()
  @IsBoolean()
  visualInspectionPassed!: boolean;

  @ApiProperty()
  @IsBoolean()
  functionalTestPassed!: boolean;

  @ApiPropertyOptional(reading('ohms'))
  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  earthResistanceOhm?: number;

  @ApiPropertyOptional(reading('megaohms'))
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  insulationMainsMOhm?: number;

  @ApiPropertyOptional(reading('megaohms'))
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  insulationAppliedMOhm?: number;

  @ApiPropertyOptional(reading('microamps'))
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  equipmentLeakageUa?: number;

  @ApiPropertyOptional(reading('microamps'))
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  appliedPartLeakageUa?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;
}

export class SafetyTestCorrectionDto extends SafetyTestInputDto {
  @ApiProperty({ description: 'Why the record is being corrected' })
  @IsString()
  @MinLength(10, { message: 'Say why the record is being corrected' })
  @MaxLength(1000)
  correctionReason!: string;
}
