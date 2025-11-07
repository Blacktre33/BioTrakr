import { Injectable, NotFoundException } from '@nestjs/common';

import type { Prisma, AssetScanLog } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { CreateAssetScanDto } from './dto/create-asset-scan.dto';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAssetScan(
    assetId: string,
    payload: CreateAssetScanDto,
  ): Promise<AssetScanLog> {
    // Fail fast if the asset ID is invalid; avoids orphaning scan rows and returns a clean 404.
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} does not exist.`);
    }

    const data: Prisma.AssetScanLogCreateInput = {
      asset: { connect: { id: assetId } },
      qrPayload: payload.qrPayload,
      notes: payload.notes ?? null,
      locationHint: payload.locationHint ?? null,
    };

    // Persist the scan log with a relational connect instead of writing the FK manually.
    return this.prisma.assetScanLog.create({ data });
  }

  async listAssetScans(assetId: string): Promise<AssetScanLog[]> {
    // Re-run the lightweight existence check so consumers get a 404 instead of an empty list for bad IDs.
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} does not exist.`);
    }

    // Return newest-first so the UI can render the freshest scan at the top.
    return this.prisma.assetScanLog.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
