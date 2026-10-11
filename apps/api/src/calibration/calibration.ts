import { BadRequestException, ConflictException } from '@nestjs/common';
import type {
  CalibrationResult,
  Prisma,
  ServiceProvider,
} from '@prisma/client';

import {
  changeAssetStatus,
  isStopStatus,
} from '../assets/asset-status.service';
import { BIOMED_ROLES } from '../auth/roles';
import {
  bestEffort,
  deviceForNotice,
  deviceLabel,
  notify,
} from '../notifications/notify';
import type { CalibrationInputDto } from './calibration.dto';

type Tx = Prisma.TransactionClient;

/** Used when the device has no calibration interval of its own. */
export const DEFAULT_CALIBRATION_INTERVAL_DAYS = 365;
const DAY = 24 * 60 * 60 * 1000;

export const PROVIDER_LABEL: Record<ServiceProvider, string> = {
  IN_HOUSE: 'in-house',
  EXTERNAL_LAB: 'an external laboratory',
  VENDOR: 'the manufacturer or vendor',
};

/**
 * What is missing or inconsistent in a calibration before it is recorded.
 * An outside laboratory's certificate must name the lab, its NABL
 * accreditation and the measurement uncertainty (NHSRC guidelines); work
 * done in-house must say which reference equipment it was traced to.
 */
export function calibrationProblems(
  input: CalibrationInputDto,
  now: Date = new Date(),
): string[] {
  const problems: string[] = [];
  const has = (v?: string) => Boolean(v?.trim());
  const calibratedAt = new Date(input.calibratedAt);

  if (calibratedAt.getTime() > now.getTime() + DAY) {
    problems.push('The calibration date cannot be in the future');
  }
  if (input.validUntil && new Date(input.validUntil) <= calibratedAt) {
    problems.push('"Valid until" must be after the calibration date');
  }
  if (input.provider === 'EXTERNAL_LAB') {
    if (!has(input.providerName)) problems.push('Name the laboratory');
    if (!has(input.labAccreditationNumber)) {
      problems.push("Enter the laboratory's NABL accreditation number");
    }
    if (!has(input.certificateNumber)) {
      problems.push('Enter the calibration certificate number');
    }
    if (!has(input.measurementUncertainty)) {
      problems.push(
        'Enter the measurement uncertainty stated on the certificate',
      );
    }
  }
  if (input.provider === 'VENDOR' && !has(input.providerName)) {
    problems.push('Name the manufacturer or vendor');
  }
  if (input.provider === 'IN_HOUSE' && !has(input.referenceStandards)) {
    problems.push(
      'Say which reference equipment was used, and its own calibration',
    );
  }
  if (input.result === 'FAIL' && (input.notes?.trim().length ?? 0) < 5) {
    problems.push('Say what was out of tolerance');
  }
  return problems;
}

/**
 * When the next calibration falls due after this one. A failed calibration
 * is due again at once: the device needs recalibrating after repair.
 */
export function calibrationDueAfter(
  record: {
    calibratedAt: Date;
    validUntil: Date | null;
    result: CalibrationResult;
  },
  intervalDays: number | null | undefined,
): Date {
  if (record.result === 'FAIL') return record.calibratedAt;
  return (
    record.validUntil ??
    new Date(
      record.calibratedAt.getTime() +
        (intervalDays ?? DEFAULT_CALIBRATION_INTERVAL_DAYS) * DAY,
    )
  );
}

const clean = (v?: string) => v?.trim() || null;

/**
 * Records a calibration (or a correction of one) and brings the device's
 * calibration dates and result up to date, in the caller's transaction.
 * A failed calibration that is now the latest takes the device out of use
 * and tells biomed.
 */
export async function recordCalibration(
  tx: Tx,
  e: {
    assetId: string;
    organizationId: string;
    input: CalibrationInputDto;
    recordedById: string;
    workOrderId?: string | null;
    supersedesId?: string;
    correctionReason?: string;
  },
) {
  const problems = calibrationProblems(e.input);
  if (problems.length) throw new BadRequestException(problems);

  let record;
  try {
    record = await tx.calibrationRecord.create({
      data: {
        assetId: e.assetId,
        workOrderId: e.workOrderId ?? null,
        calibratedAt: new Date(e.input.calibratedAt),
        provider: e.input.provider,
        providerName: clean(e.input.providerName),
        labAccreditationNumber: clean(e.input.labAccreditationNumber),
        certificateNumber: clean(e.input.certificateNumber),
        validUntil: e.input.validUntil ? new Date(e.input.validUntil) : null,
        measurementUncertainty: clean(e.input.measurementUncertainty),
        referenceStandards: clean(e.input.referenceStandards),
        result: e.input.result,
        notes: clean(e.input.notes),
        recordedById: e.recordedById,
        supersedesId: e.supersedesId ?? null,
        correctionReason: clean(e.correctionReason),
      },
    });
  } catch (error) {
    // The unique supersedesId: someone corrected this record just now.
    if ((error as { code?: string }).code === 'P2002') {
      throw new ConflictException(
        'This record has already been corrected. Reload and correct the latest version.',
      );
    }
    throw error;
  }

  const latest = await refreshCalibrationState(tx, e.assetId, e.organizationId);
  if (latest?.id === record.id && record.result === 'FAIL') {
    await takeOutOfUse(tx, e, record.notes);
  }
  return record;
}

/**
 * Sets the device's last calibration, next due date and last result from
 * its latest calibration that has not been corrected. Recomputed rather
 * than adjusted, so back-dated entries and corrections land right.
 */
export async function refreshCalibrationState(
  tx: Tx,
  assetId: string,
  organizationId: string,
) {
  const asset = await tx.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { calibrationFrequencyDays: true },
  });
  if (!asset) return null;
  const latest = await tx.calibrationRecord.findFirst({
    where: { assetId, supersededBy: null },
    orderBy: [{ calibratedAt: 'desc' }, { recordedAt: 'desc' }],
    select: { id: true, calibratedAt: true, validUntil: true, result: true },
  });
  if (!latest) return null;
  await tx.asset.updateMany({
    where: { id: assetId, organizationId },
    data: {
      lastCalibrationDate: latest.calibratedAt,
      nextCalibrationDue: calibrationDueAfter(
        latest,
        asset.calibrationFrequencyDays,
      ),
      lastCalibrationResult: latest.result,
    },
  });
  return latest;
}

async function takeOutOfUse(
  tx: Tx,
  e: {
    assetId: string;
    organizationId: string;
    recordedById: string;
    workOrderId?: string | null;
  },
  notes: string | null,
) {
  const device = await tx.asset.findFirst({
    where: { id: e.assetId, organizationId: e.organizationId },
    select: { assetStatus: true },
  });
  if (device && !isStopStatus(device.assetStatus)) {
    await changeAssetStatus(tx, {
      assetId: e.assetId,
      organizationId: e.organizationId,
      toStatus: 'QUARANTINED',
      reason: `Failed calibration: ${notes ?? ''}`.slice(0, 1000),
      source: e.workOrderId ? 'WORK_ORDER' : 'MANUAL',
      changedById: e.recordedById,
      workOrderId: e.workOrderId ?? null,
    });
  }
  await bestEffort(tx, 'calibration notice', async () => {
    const d = await deviceForNotice(tx, e.assetId, e.organizationId);
    if (!d) return;
    await notify(tx, {
      organizationId: e.organizationId,
      kind: 'calibration_failed',
      severity: 'warning',
      title: `Failed calibration: ${deviceLabel(d)}`,
      body: [notes, 'It is out of use until a passing calibration is recorded.']
        .filter(Boolean)
        .join('\n'),
      link: `/assets/${d.id}`,
      assetId: d.id,
      workOrderId: e.workOrderId ?? undefined,
      to: { roles: BIOMED_ROLES, facilityId: d.currentFacilityId },
      excludeUserId: e.recordedById,
    });
  });
}
