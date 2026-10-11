import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { OPEN_STATUSES } from '../work-orders/work-orders.service';
import { recordSafetyTest } from './safety-test';
import type {
  SafetyTestCorrectionDto,
  SafetyTestInputDto,
} from './safety-test.dto';

const RECORD_SELECT = {
  id: true,
  assetId: true,
  workOrderId: true,
  testedAt: true,
  reason: true,
  provider: true,
  providerName: true,
  analyzer: true,
  electricalClass: true,
  appliedPartType: true,
  leakageMethod: true,
  medicalSystem: true,
  mobileXray: true,
  defibrillationPaddles: true,
  visualInspectionPassed: true,
  functionalTestPassed: true,
  earthResistanceOhm: true,
  insulationMainsMOhm: true,
  insulationAppliedMOhm: true,
  equipmentLeakageUa: true,
  appliedPartLeakageUa: true,
  passed: true,
  checks: true,
  notes: true,
  recordedAt: true,
  supersedesId: true,
  correctionReason: true,
  recordedBy: { select: { firstName: true, lastName: true } },
  supersededBy: { select: { id: true } },
} satisfies Prisma.SafetyTestRecordSelect;

type Row = Prisma.SafetyTestRecordGetPayload<{ select: typeof RECORD_SELECT }>;

const present = ({ recordedBy, supersededBy, ...row }: Row) => ({
  ...row,
  recordedBy: `${recordedBy.firstName} ${recordedBy.lastName}`.trim(),
  /** The correction that replaced this record, if any. */
  correctedBy: supersededBy?.id ?? null,
});

@Injectable()
export class SafetyTestsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A device's safety tests, newest first, corrected ones included and marked. */
  async list(assetId: string, user: AuthUser) {
    await this.assertAsset(this.prisma, assetId, user);
    const rows = await this.prisma.safetyTestRecord.findMany({
      where: { assetId },
      orderBy: [{ testedAt: 'desc' }, { recordedAt: 'desc' }],
      take: 200,
      select: RECORD_SELECT,
    });
    return rows.map(present);
  }

  /**
   * Records a test that has no work order, such as one done after a repair
   * or at acceptance. The device joins the safety test programme if it was
   * not in it.
   */
  async create(assetId: string, dto: SafetyTestInputDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertAsset(tx, assetId, user);
      // One record per test: an open work order is completed instead.
      const open = await tx.maintenanceHistory.count({
        where: {
          assetId,
          workOrderType: 'ELECTRICAL_SAFETY_TEST',
          workOrderStatus: { in: OPEN_STATUSES },
        },
      });
      if (open > 0) {
        throw new ConflictException(
          'This device has an open electrical safety test work order. Complete it with these readings instead.',
        );
      }
      await tx.asset.updateMany({
        where: { id: assetId, organizationId: user.organizationId },
        data: { requiresSafetyTest: true },
      });
      const record = await recordSafetyTest(tx, {
        assetId,
        organizationId: user.organizationId,
        input: dto,
        recordedById: user.userId,
      });
      return present(
        (await tx.safetyTestRecord.findFirst({
          where: { id: record.id },
          select: RECORD_SELECT,
        }))!,
      );
    });
  }

  /** Corrects a record by adding one that replaces it; the original is kept. */
  async correct(id: string, dto: SafetyTestCorrectionDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.safetyTestRecord.findFirst({
        where: { id, asset: { organizationId: user.organizationId } },
        select: {
          assetId: true,
          workOrderId: true,
          supersededBy: { select: { id: true } },
        },
      });
      if (!original) {
        throw new NotFoundException('Safety test record not found');
      }
      if (original.supersededBy) {
        throw new ConflictException(
          'This record has already been corrected. Correct the latest version.',
        );
      }
      const { correctionReason, ...input } = dto;
      const record = await recordSafetyTest(tx, {
        assetId: original.assetId,
        organizationId: user.organizationId,
        input,
        recordedById: user.userId,
        workOrderId: original.workOrderId,
        supersedesId: id,
        correctionReason,
      });
      return present(
        (await tx.safetyTestRecord.findFirst({
          where: { id: record.id },
          select: RECORD_SELECT,
        }))!,
      );
    });
  }

  private async assertAsset(
    db: Pick<Prisma.TransactionClient, 'asset'>,
    assetId: string,
    user: AuthUser,
  ) {
    const asset = await db.asset.findFirst({
      where: {
        id: assetId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);
  }
}
