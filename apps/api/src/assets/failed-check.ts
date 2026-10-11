import type { Prisma } from '@prisma/client';

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
 * A device failed a check that makes it unsafe (calibration, electrical
 * safety): it is quarantined, unless already out of use, and biomed is
 * told. The release guard in changeAssetStatus keeps it out of use until
 * a passing check is recorded.
 */
export async function takeOutOfUseAfterFailedCheck(
  tx: Prisma.TransactionClient,
  e: {
    assetId: string;
    organizationId: string;
    recordedById: string;
    workOrderId?: string | null;
    /** "Failed calibration", "Failed electrical safety test"… */
    what: string;
    details: string | null;
    until: string;
    kind: NotificationKind;
  },
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
      reason: `${e.what}: ${e.details ?? ''}`.slice(0, 1000),
      source: e.workOrderId ? 'WORK_ORDER' : 'MANUAL',
      changedById: e.recordedById,
      workOrderId: e.workOrderId ?? null,
    });
  }
  await bestEffort(tx, `${e.kind} notice`, async () => {
    const d = await deviceForNotice(tx, e.assetId, e.organizationId);
    if (!d) return;
    await notify(tx, {
      organizationId: e.organizationId,
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
      excludeUserId: e.recordedById,
    });
  });
}
