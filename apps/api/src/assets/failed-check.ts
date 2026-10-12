import type { Prisma } from '@prisma/client';

import { audit, type Actor } from '../audit/audit';
import { BIOMED_ROLES } from '../auth/roles';
import {
  bestEffort,
  deviceForNotice,
  deviceLabel,
  notify,
  type NotificationKind,
} from '../notifications/notify';
import { changeAssetStatus, isStopStatus } from './asset-status.service';

/**
 * After a correction, scheduled work for a due date that no longer applies
 * is cancelled: typically the retest opened at once for a failed check that
 * turned out to be a pass. Only work nobody has started, and only what the
 * schedule opened; it opens again for the new due date in good time.
 */
export async function cancelStaleScheduledWork(
  tx: Prisma.TransactionClient,
  e: {
    assetId: string;
    actor: Actor;
    workOrderType: 'CALIBRATION' | 'ELECTRICAL_SAFETY_TEST';
    nextDue: Date | null;
    why: string;
  },
): Promise<number> {
  if (!e.nextDue) return 0;
  const stale = await tx.maintenanceHistory.findMany({
    where: {
      assetId: e.assetId,
      workOrderType: e.workOrderType,
      workOrderStatus: { in: ['PENDING', 'ASSIGNED'] },
      createdByUserId: null,
      dueDate: { lt: e.nextDue },
    },
    select: { id: true, workOrderStatus: true, description: true },
  });
  let cancelled = 0;
  for (const wo of stale) {
    const { count } = await tx.maintenanceHistory.updateMany({
      where: { id: wo.id, workOrderStatus: wo.workOrderStatus },
      data: {
        workOrderStatus: 'CANCELLED',
        workPerformed: `Cancelled: ${e.why}`,
      },
    });
    if (count === 0) continue;
    cancelled++;
    audit(tx, e.actor, {
      action: 'work_order.cancelled',
      entityType: 'work_order',
      entityId: wo.id,
      assetId: e.assetId,
      summary: `Work order cancelled: ${wo.description?.split('\n')[0] ?? 'scheduled work'}`,
      reason: e.why,
    });
  }
  return cancelled;
}

/**
 * A device failed a check that makes it unsafe (calibration, electrical
 * safety): it is quarantined, unless already out of use, and biomed is
 * told. The release guard in changeAssetStatus keeps it out of use until
 * a passing check is recorded.
 */
export async function takeOutOfUseAfterFailedCheck(
  tx: Prisma.TransactionClient,
  e: {
    assetId: string;
    actor: Actor;
    workOrderId?: string | null;
    /** "Failed calibration", "Failed electrical safety test"… */
    what: string;
    details: string | null;
    until: string;
    kind: NotificationKind;
  },
) {
  const { organizationId } = e.actor;
  const device = await tx.asset.findFirst({
    where: { id: e.assetId, organizationId },
    select: { assetStatus: true },
  });
  if (device && !isStopStatus(device.assetStatus)) {
    await changeAssetStatus(tx, {
      assetId: e.assetId,
      actor: e.actor,
      toStatus: 'QUARANTINED',
      reason: `${e.what}: ${e.details ?? ''}`.slice(0, 1000),
      source: e.workOrderId ? 'WORK_ORDER' : 'MANUAL',
      workOrderId: e.workOrderId ?? null,
    });
  }
  await bestEffort(tx, `${e.kind} notice`, async () => {
    const d = await deviceForNotice(tx, e.assetId, organizationId);
    if (!d) return;
    await notify(tx, {
      organizationId,
      kind: e.kind,
      severity: 'warning',
      title: `${e.what}: ${deviceLabel(d)}`,
      body: [e.details, `It is out of use until ${e.until}.`]
        .filter(Boolean)
        .join('\n'),
      link: `/assets/${d.id}`,
      assetId: d.id,
      workOrderId: e.workOrderId ?? undefined,
      to: { roles: BIOMED_ROLES, facilityId: d.currentFacilityId },
      excludeUserId: e.actor.userId,
    });
  });
}
