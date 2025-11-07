import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAssetScanDto {
  @ApiProperty({ description: 'Raw payload encoded in the scanned QR code' })
  @IsString()
  @IsNotEmpty()
  readonly qrPayload!: string;

  @ApiPropertyOptional({
    description: 'Operator notes captured during the scan',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly notes?: string;

  @ApiPropertyOptional({
    description: 'Optional free-form location hint (room, floor, etc.)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly locationHint?: string;
}
