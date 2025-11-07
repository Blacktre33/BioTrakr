import { ApiProperty } from '@nestjs/swagger';

import type { AssetScanLog } from '@prisma/client';

export class AssetScanLogDto {
  @ApiProperty()
  readonly id!: string;

  @ApiProperty()
  readonly assetId!: string;

  @ApiProperty({ description: 'Raw payload encoded in the scanned QR code' })
  readonly qrPayload!: string;

  @ApiProperty({ required: false })
  readonly notes?: string | null;

  @ApiProperty({ required: false })
  readonly locationHint?: string | null;

  @ApiProperty()
  readonly createdAt!: Date;

  static fromEntity(entity: AssetScanLog): AssetScanLogDto {
    return {
      id: entity.id,
      assetId: entity.assetId,
      qrPayload: entity.qrPayload,
      notes: entity.notes,
      locationHint: entity.locationHint,
      createdAt: entity.createdAt,
    } satisfies AssetScanLogDto;
  }
}
