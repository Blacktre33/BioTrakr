import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { takeOutOfUseAfterFailedCheck } from '../assets/failed-check';
import { evaluateSafetyTest, type SafetyEvaluation } from './iec62353';
import type { SafetyTestInputDto } from './safety-test.dto';

type Tx = Prisma.TransactionClient;

/** Used when the device has no safety test interval of its own. */
export const DEFAULT_SAFETY_TEST_INTERVAL_DAYS = 365;
const DAY = 24 * 60 * 60 * 1000;

/**
 * The readings held to IEC 62353's limits, plus what else a record needs:
 * a date that is not in the future, and who did it when not in-house.
 */
export function safetyTestProblems(
  input: SafetyTestInputDto,
  now: Date = new Date(),
): { problems: string[]; evaluation: SafetyEvaluation } {
  const problems: string[] = [];
  if (new Date(input.testedAt).getTime() > now.getTime() + DAY) {
    problems.push('The test date cannot be in the future');
  }
  if (input.provider !== 'IN_HOUSE' && !input.providerName?.trim()) {
    problems.push(
      input.provider === 'EXTERNAL_LAB'
        ? 'Name the laboratory'
        : 'Name the manufacturer or vendor',
    );
  }
  const evaluation = evaluateSafetyTest(input);
  problems.push(...evaluation.missing);
  return { problems, evaluation };
}

/** A failed test is due again at once: the device needs retesting after repair. */
export function safetyTestDueAfter(
  record: { testedAt: Date; passed: boolean },
  intervalDays: number | null | undefined,
): Date {
  if (!record.passed) return record.testedAt;
  return new Date(
    record.testedAt.getTime() +
      (intervalDays ?? DEFAULT_SAFETY_TEST_INTERVAL_DAYS) * DAY,
  );
}

const clean = (v?: string) => v?.trim() || null;
const reading = (v?: number) => (typeof v === 'number' ? v : null);

/**
 * Records an electrical safety test (or a correction of one), with pass or
 * fail worked out from the readings, and brings the device's test dates up
 * to date. A failed test that is now the latest takes the device out of
 * use and tells biomed.
 */
export async function recordSafetyTest(
  tx: Tx,
  e: {
    assetId: string;
    organizationId: string;
    input: SafetyTestInputDto;
    recordedById: string;
    workOrderId?: string | null;
    supersedesId?: string;
    correctionReason?: string;
  },
) {
  const { problems, evaluation } = safetyTestProblems(e.input);
  if (problems.length) throw new BadRequestException(problems);
  const i = e.input;

  let record;
  try {
    record = await tx.safetyTestRecord.create({
      data: {
        assetId: e.assetId,
        workOrderId: e.workOrderId ?? null,
        testedAt: new Date(i.testedAt),
        reason: i.reason,
        provider: i.provider,
        providerName: i.provider === 'IN_HOUSE' ? null : clean(i.providerName),
        analyzer: i.analyzer.trim(),
        electricalClass: i.electricalClass,
        appliedPartType: i.appliedPartType,
        leakageMethod: i.leakageMethod,
        medicalSystem: i.medicalSystem ?? false,
        mobileXray: i.mobileXray ?? false,
        defibrillationPaddles: i.defibrillationPaddles ?? false,
        visualInspectionPassed: i.visualInspectionPassed,
        functionalTestPassed: i.functionalTestPassed,
        earthResistanceOhm: reading(i.earthResistanceOhm),
        insulationMainsMOhm: reading(i.insulationMainsMOhm),
        insulationAppliedMOhm: reading(i.insulationAppliedMOhm),
        equipmentLeakageUa: reading(i.equipmentLeakageUa),
        appliedPartLeakageUa: reading(i.appliedPartLeakageUa),
        passed: evaluation.passed,
        checks: evaluation.checks as unknown as Prisma.InputJsonValue,
        notes: clean(i.notes),
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

  // The device's class and applied parts, if nobody had set them yet.
  await tx.asset.updateMany({
    where: {
      id: e.assetId,
      organizationId: e.organizationId,
      electricalClass: null,
    },
    data: { electricalClass: i.electricalClass },
  });
  await tx.asset.updateMany({
    where: {
      id: e.assetId,
      organizationId: e.organizationId,
      appliedPartType: null,
    },
    data: { appliedPartType: i.appliedPartType },
  });

  const latest = await refreshSafetyTestState(tx, e.assetId, e.organizationId);
  if (latest?.id === record.id && !record.passed) {
    await takeOutOfUseAfterFailedCheck(tx, {
      ...e,
      what: 'Failed electrical safety test',
      details: [evaluation.failures.join('; '), record.notes]
        .filter(Boolean)
        .join('. '),
      until: 'a passing test is recorded',
      kind: 'safety_test_failed',
    });
  }
  return record;
}

/**
 * Sets the device's last test, next due date and last result from its
 * latest test that has not been corrected.
 */
export async function refreshSafetyTestState(
  tx: Tx,
  assetId: string,
  organizationId: string,
) {
  const asset = await tx.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { safetyTestFrequencyDays: true },
  });
  if (!asset) return null;
  const latest = await tx.safetyTestRecord.findFirst({
    where: { assetId, supersededBy: null },
    orderBy: [{ testedAt: 'desc' }, { recordedAt: 'desc' }],
    select: { id: true, testedAt: true, passed: true },
  });
  if (!latest) return null;
  await tx.asset.updateMany({
    where: { id: assetId, organizationId },
    data: {
      lastSafetyInspectionDate: latest.testedAt,
      nextSafetyInspectionDue: safetyTestDueAfter(
        latest,
        asset.safetyTestFrequencyDays,
      ),
      lastSafetyTestPassed: latest.passed,
    },
  });
  return latest;
}
