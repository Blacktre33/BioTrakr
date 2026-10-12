import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/** The registers BioTrakr prints. */
export const REGISTER_KINDS = [
  'inventory',
  'survey',
  'logbook',
  'calibration',
  'safety',
  'pm',
  'breakdown',
  'contracts',
  'audit',
] as const;
export type RegisterKind = (typeof REGISTER_KINDS)[number];

export class RegisterQuery {
  @ApiPropertyOptional({ description: 'One facility; all when absent' })
  @IsUUID()
  @IsOptional()
  facilityId?: string;

  @ApiPropertyOptional({
    description:
      'Start of the period (registers of events); default a year ago',
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'End of the period; default today' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ description: 'The device (logbook only)' })
  @IsUUID()
  @IsOptional()
  assetId?: string;
}
