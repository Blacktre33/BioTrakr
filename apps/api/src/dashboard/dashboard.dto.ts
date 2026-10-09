import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class DashboardQuery {
  @ApiPropertyOptional({ description: 'Only devices at this facility' })
  @IsUUID()
  @IsOptional()
  facilityId?: string;
}
