import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsUUID } from 'class-validator';

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
