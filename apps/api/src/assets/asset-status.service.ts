import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AssetStatus, Prisma, StatusChangeSource } from '@prisma/client';

import { actorOf, audit, auditedTransaction, type Actor } from '../audit/audit';
import { words } from '../audit/changes';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';

/** Statuses that mean "do not use on patients" (shown red on /scan). */
export const STOP_STATUSES: ReadonlySet<AssetStatus> = new Set<AssetStatus>([
  'QUARANTINED',
  'IN_MAINTENANCE',
  'CONDEMNED',
  'RETIRED',
  'DISPOSED',
]);

export const isStopStatus = (status: AssetStatus) => STOP_STATUSES.has(status);

/** Out of use for now: being repaired or held back after a fault. */
export const OUT_OF_USE_STATUSES: AssetStatus[] = [
  'QUARANTINED',
  'IN_MAINTENANCE',
];
/** No longer in service: not counted as stock and never due for PM. */
export const RETIRED_STATUSES: AssetStatus[] = [
  'CONDEMNED',
  'RETIRED',
  'DISPOSED',
];

type Tx = Prisma.TransactionClient;

export interface StatusChangeInput {
  assetId: string;
  /** Who: a person, or the system for a device alert. Their hospital is the device's. */
  actor: Actor;
  toStatus: AssetStatus;
  reason: string;
  source: StatusChangeSource;
  workOrderId?: string | null;
  /** Only change if the status is still this (guards against two people at once). */
  expectedStatus?: AssetStatus;
}

export type StatusChangeResult =
  | {
      changed: true;
      fromStatus: AssetStatus;
      toStatus: AssetStatus;
      changedAt: Date;
    }
  | {
      changed: false;
      reason: 'not_found' | 'unchanged' | 'conflict';
      current?: AssetStatus;
    };

/**
 * Changes an asset's status and records who, why and from where, in the
 * caller's (audited) transaction. The status write is conditional on the
 * status read, so two simultaneous changes cannot both win.
 */
export async function changeAssetStatus(
  tx: Tx,
  input: StatusChangeInput,
): Promise<StatusChangeResult> {
  const { organizationId, userId: changedById } = input.actor;
  const asset = await tx.asset.findFirst({
    where: {
      id: input.assetId,
      organizationId,
      deletedAt: null,
    },
    select: {
      assetTagNumber: true,
      assetStatus: true,
      lastCalibrationResult: true,
      lastSafetyTestPassed: true,
    },
  });
  if (!asset) return { changed: false, reason: 'not_found' };

  const fromStatus = asset.assetStatus;
  if (input.expectedStatus && input.expectedStatus !== fromStatus) {
    return { changed: false, reason: 'conflict', current: fromStatus };
  }
  if (fromStatus === input.toStatus) {
    return { changed: false, reason: 'unchanged', current: fromStatus };
  }
  // Every way back into use comes through here (work orders, the device
  // page, imports), so a failed calibration cannot be bypassed.
  if (isStopStatus(fromStatus) && !isStopStatus(input.toStatus)) {
    if (asset.lastCalibrationResult === 'FAIL') {
      throw new BadRequestException(
        'This device failed its last calibration. Record a passing calibration before putting it back into use.',
      );
    }
    if (asset.lastSafetyTestPassed === false) {
      throw new BadRequestException(
        'This device failed its last electrical safety test. Record a passing test before putting it back into use.',
      );
    }
  }

  const { count } = await tx.asset.updateMany({
    where: {
      id: input.assetId,
      organizationId,
      deletedAt: null,
      assetStatus: fromStatus,
    },
    data: {
      assetStatus: input.toStatus,
      ...(changedById ? { updatedById: changedById } : {}),
    },
  });
  if (count === 0) return { changed: false, reason: 'conflict' };

  const record = await tx.assetStatusChange.create({
    data: {
      assetId: input.assetId,
      fromStatus,
      toStatus: input.toStatus,
      reason: input.reason,
      source: input.source,
      changedById,
      workOrderId: input.workOrderId ?? null,
    },
  });
  audit(tx, input.actor, {
    action: 'asset.status_changed',
    entityType: 'asset',
    entityId: input.assetId,
    assetId: input.assetId,
    summary: `${asset.assetTagNumber}: ${words(fromStatus)} → ${words(input.toStatus)}`,
    changes: [
      {
        field: 'assetStatus',
        label: 'Status',
        from: words(fromStatus),
        to: words(input.toStatus),
      },
    ],
    reason: input.reason,
  });
  return {
    changed: true,
    fromStatus,
    toStatus: input.toStatus,
    changedAt: record.changedAt,
  };
}

@Injectable()
export class AssetStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /** A person changes a device's status on its page. */
  async changeStatus(
    assetId: string,
    body: {
      status: AssetStatus;
      reason: string;
      expectedStatus: AssetStatus;
      confirmSafe?: boolean;
    },
    user: AuthUser,
  ) {
    const reason = body.reason.trim();
    if (reason.length < 5) {
      throw new BadRequestException(
        'Say why the status is changing (at least a few words)',
      );
    }
    if (body.status === 'CONDEMNED' || body.status === 'DISPOSED') {
      throw new BadRequestException(
        "Propose the device for condemnation instead: the committee's decision and the disposal are then on file",
      );
    }

    const result = await auditedTransaction(this.prisma, async (tx) => {
      const current = await tx.asset.findFirst({
        where: {
          id: assetId,
          organizationId: user.organizationId,
          deletedAt: null,
        },
        select: { assetStatus: true },
      });
      // Condemnation and disposal are final; only an administrator can
      // correct a mistake.
      if (
        (current?.assetStatus === 'DISPOSED' ||
          current?.assetStatus === 'CONDEMNED') &&
        user.role !== 'admin'
      ) {
        throw new ForbiddenException(
          `Only an administrator can change the status of a ${current.assetStatus === 'DISPOSED' ? 'disposed' : 'condemned'} device`,
        );
      }
      // The committee's approval is reversed on the condemnation, so the
      // file says so too.
      if (current?.assetStatus === 'CONDEMNED') {
        const approved = await tx.condemnation.findFirst({
          where: { assetId, status: 'APPROVED' },
          select: { id: true },
        });
        if (approved) {
          throw new BadRequestException(
            'The committee condemned this device: reverse the condemnation on the device page instead',
          );
        }
      }
      // Putting a device back into use is what turns the scan banner green;
      // it needs an explicit statement that the device is safe.
      // (A stale expectedStatus is reported as a conflict below instead.)
      if (
        current &&
        current.assetStatus === body.expectedStatus &&
        isStopStatus(current.assetStatus) &&
        !isStopStatus(body.status) &&
        !body.confirmSafe
      ) {
        throw new BadRequestException(
          'Confirm the device has been checked and is safe to use before putting it back into use',
        );
      }
      return changeAssetStatus(tx, {
        assetId,
        actor: actorOf(user),
        toStatus: body.status,
        reason,
        source: 'MANUAL',
        expectedStatus: body.expectedStatus,
      });
    });

    if (result.changed) return result;
    const failure = result as Extract<StatusChangeResult, { changed: false }>;
    if (failure.reason === 'not_found') {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }
    if (failure.reason === 'unchanged') {
      throw new BadRequestException('The device already has this status');
    }
    throw new ConflictException(
      'Someone else changed this device’s status just now. Reload and check before trying again.',
    );
  }

  async history(assetId: string, user: AuthUser) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);

    const rows = await this.prisma.assetStatusChange.findMany({
      where: { assetId },
      orderBy: { changedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        reason: true,
        source: true,
        workOrderId: true,
        changedAt: true,
        changedBy: { select: { firstName: true, lastName: true } },
      },
    });
    return rows.map(({ changedBy, ...row }) => ({
      ...row,
      changedBy: changedBy
        ? `${changedBy.firstName} ${changedBy.lastName}`.trim()
        : null,
    }));
  }
}
