import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import { AssetsService } from './assets.service';

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    prisma = {
      asset: {
        findUnique: jest.fn(),
      },
      assetScanLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    service = new AssetsService(prisma);
  });

  describe('createAssetScan', () => {
    it('throws when the asset does not exist', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);

      await expect(
        service.createAssetScan('asset-id', { qrPayload: 'payload' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('persists a scan log when the asset exists', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'asset-id' } as never);
      const created = {
        id: 'scan-id',
        assetId: 'asset-id',
        qrPayload: 'payload',
        notes: null,
        locationHint: null,
        createdAt: new Date(),
      };
      prisma.assetScanLog.create.mockResolvedValue(created as never);

      const result = await service.createAssetScan('asset-id', {
        qrPayload: 'payload',
      });

      expect(prisma.assetScanLog.create).toHaveBeenCalledWith({
        data: {
          asset: { connect: { id: 'asset-id' } },
          qrPayload: 'payload',
          notes: null,
          locationHint: null,
        },
      });
      expect(result).toEqual(created);
    });
  });

  describe('listAssetScans', () => {
    it('throws when the asset does not exist', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);

      await expect(service.listAssetScans('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns scans ordered by created date', async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: 'asset-id' } as never);
      const scans = [{ id: 'scan', createdAt: new Date() }];
      prisma.assetScanLog.findMany.mockResolvedValue(scans as never);

      const result = await service.listAssetScans('asset-id');

      expect(prisma.assetScanLog.findMany).toHaveBeenCalledWith({
        where: { assetId: 'asset-id' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(scans);
    });
  });
});
