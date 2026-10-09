import { NotFoundException } from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import { AssetsService } from './assets.service';

const user: AuthUser = {
  userId: 'user-1',
  organizationId: 'org-1',
  role: 'technician',
  email: 't@example.test',
};

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: {
    asset: { findFirst: jest.Mock };
    assetScanLog: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      asset: { findFirst: jest.fn() },
      assetScanLog: { create: jest.fn(), findMany: jest.fn() },
    };
    service = new AssetsService(prisma as unknown as PrismaService);
  });

  describe('createAssetScan', () => {
    it('throws when the asset is not in the caller organization', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.createAssetScan('asset-id', { qrPayload: 'payload' }, user),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.asset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'asset-id', organizationId: 'org-1', deletedAt: null },
        }),
      );
      expect(prisma.assetScanLog.create).not.toHaveBeenCalled();
    });

    it('persists a scan log when the asset exists', async () => {
      prisma.asset.findFirst.mockResolvedValue({ id: 'asset-id' });
      const created = {
        id: 'scan-id',
        assetId: 'asset-id',
        qrPayload: 'payload',
        notes: null,
        locationHint: null,
        createdAt: new Date(),
      };
      prisma.assetScanLog.create.mockResolvedValue(created);

      const result = await service.createAssetScan(
        'asset-id',
        { qrPayload: 'payload' },
        user,
      );

      expect(prisma.assetScanLog.create).toHaveBeenCalledWith({
        data: {
          asset: { connect: { id: 'asset-id' } },
          qrPayload: 'payload',
          notes: null,
          locationHint: null,
          scannedBy: { connect: { id: 'user-1' } },
        },
      });
      expect(result).toBe(created);
    });
  });

  describe('listAssetScans', () => {
    it('throws when the asset is not in the caller organization', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.listAssetScans('missing', user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns logs newest first', async () => {
      prisma.asset.findFirst.mockResolvedValue({ id: 'asset-id' });
      prisma.assetScanLog.findMany.mockResolvedValue([]);

      await service.listAssetScans('asset-id', user);

      expect(prisma.assetScanLog.findMany).toHaveBeenCalledWith({
        where: { assetId: 'asset-id' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
