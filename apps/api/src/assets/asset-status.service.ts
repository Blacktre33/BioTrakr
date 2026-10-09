import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AssetStatus, Prisma, StatusChangeSource } from '@prisma/client';

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

type Tx = Prisma.TransactionClient;

export interface StatusChangeInput {
  assetId: string;
  organizationId: string;
  toStatus: AssetStatus;
  reason: string;
  source: StatusChangeSource;
  changedById?: string | null;
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
 * caller's transaction. The status write is conditional on the status read,
 * so two simultaneous changes cannot both win.
 */
export async function changeAssetStatus(
  tx: Tx,
  input: StatusChangeInput,
): Promise<StatusChangeResult> {
  const asset = await tx.asset.findFirst({
    where: {
      id: input.assetId,
      organizationId: input.organizationId,
      deletedAt: null,
    },
    select: { assetStatus: true },
  });
  if (!asset) return { changed: false, reason: 'not_found' };

  const fromStatus = asset.assetStatus;
  if (input.expectedStatus && input.expectedStatus !== fromStatus) {
    return { changed: false, reason: 'conflict', current: fromStatus };
  }
  if (fromStatus === input.toStatus) {
    return { changed: false, reason: 'unchanged', current: fromStatus };
  }

  const { count } = await tx.asset.updateMany({
    where: {
      id: input.assetId,
      organizationId: input.organizationId,
      deletedAt: null,
      assetStatus: fromStatus,
    },
    data: {
      assetStatus: input.toStatus,
      ...(input.changedById ? { updatedById: input.changedById } : {}),
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
      changedById: input.changedById ?? null,
      workOrderId: input.workOrderId ?? null,
    },
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

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.asset.findFirst({
        where: {
          id: assetId,
          organizationId: user.organizationId,
          deletedAt: null,
        },
        select: { assetStatus: true },
      });
      // Disposal is final; only an administrator can correct a mistake.
      if (current?.assetStatus === 'DISPOSED' && user.role !== 'admin') {
        throw new ForbiddenException(
          'Only an administrator can change the status of a disposed device',
        );
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
        organizationId: user.organizationId,
        toStatus: body.status,
        reason,
        source: 'MANUAL',
        changedById: user.userId,
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
