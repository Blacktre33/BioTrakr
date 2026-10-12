import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { actorOf, auditedTransaction } from '../audit/audit';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { documentCounts } from '../documents/documents.service';
import { OPEN_STATUSES } from '../work-orders/work-orders.service';
import { recordCalibration } from './calibration';
import type {
  CalibrationCorrectionDto,
  CalibrationInputDto,
} from './calibration.dto';

const RECORD_SELECT = {
  id: true,
  assetId: true,
  workOrderId: true,
  calibratedAt: true,
  provider: true,
  providerName: true,
  labAccreditationNumber: true,
  certificateNumber: true,
  validUntil: true,
  measurementUncertainty: true,
  referenceStandards: true,
  result: true,
  notes: true,
  recordedAt: true,
  supersedesId: true,
  correctionReason: true,
  recordedBy: { select: { firstName: true, lastName: true } },
  supersededBy: { select: { id: true } },
} satisfies Prisma.CalibrationRecordSelect;

type Row = Prisma.CalibrationRecordGetPayload<{ select: typeof RECORD_SELECT }>;

const present = ({ recordedBy, supersededBy, ...row }: Row, documents = 0) => ({
  ...row,
  recordedBy: `${recordedBy.firstName} ${recordedBy.lastName}`.trim(),
  /** The correction that replaced this record, if any. */
  correctedBy: supersededBy?.id ?? null,
  /** Files attached (not withdrawn), e.g. the certificate. */
  documents,
});

@Injectable()
export class CalibrationService {
  constructor(private readonly prisma: PrismaService) {}

  /** A device's calibrations, newest first, corrected ones included and marked. */
  async list(assetId: string, user: AuthUser) {
    await this.assertAsset(this.prisma, assetId, user);
    const rows = await this.prisma.calibrationRecord.findMany({
      where: { assetId },
      orderBy: [{ calibratedAt: 'desc' }, { recordedAt: 'desc' }],
      take: 200,
      select: RECORD_SELECT,
    });
    const files = await documentCounts(
      this.prisma,
      'calibrationRecordId',
      rows.map((r) => r.id),
    );
    return rows.map((r) => present(r, files.get(r.id)));
  }

  /**
   * Records a calibration that has no work order, such as an existing
   * certificate when a device is first registered. The device joins the
   * calibration programme if it was not in it.
   */
  async create(assetId: string, dto: CalibrationInputDto, user: AuthUser) {
    return auditedTransaction(this.prisma, async (tx) => {
      await this.assertAsset(tx, assetId, user);
      // One record per calibration: an open work order is completed instead.
      const open = await tx.maintenanceHistory.count({
        where: {
          assetId,
          workOrderType: 'CALIBRATION',
          workOrderStatus: { in: OPEN_STATUSES },
        },
      });
      if (open > 0) {
        throw new ConflictException(
          'This device has an open calibration work order. Complete it with this result instead.',
        );
      }
      await tx.asset.updateMany({
        where: { id: assetId, organizationId: user.organizationId },
        data: { requiresCalibration: true },
      });
      const record = await recordCalibration(tx, {
        assetId,
        actor: actorOf(user),
        input: dto,
      });
      return present(
        (await tx.calibrationRecord.findFirst({
          where: { id: record.id },
          select: RECORD_SELECT,
        }))!,
      );
    });
  }

  /**
   * Corrects a record by adding a new one that replaces it; the original is
   * kept, marked as corrected, with the reason.
   */
  async correct(id: string, dto: CalibrationCorrectionDto, user: AuthUser) {
    return auditedTransaction(this.prisma, async (tx) => {
      const original = await tx.calibrationRecord.findFirst({
        where: { id, asset: { organizationId: user.organizationId } },
        select: {
          assetId: true,
          workOrderId: true,
          supersededBy: { select: { id: true } },
        },
      });
      if (!original)
        throw new NotFoundException('Calibration record not found');
      if (original.supersededBy) {
        throw new ConflictException(
          'This record has already been corrected. Correct the latest version.',
        );
      }
      const { correctionReason, ...input } = dto;
      const record = await recordCalibration(tx, {
        assetId: original.assetId,
        actor: actorOf(user),
        input,
        workOrderId: original.workOrderId,
        supersedesId: id,
        correctionReason,
      });
      return present(
        (await tx.calibrationRecord.findFirst({
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
