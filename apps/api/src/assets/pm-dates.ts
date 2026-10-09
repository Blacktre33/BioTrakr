import type { Prisma } from '@prisma/client';

/** Used when PM frequency is not recorded on the asset. */
export const DEFAULT_PM_INTERVAL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

type AssetClient = { asset: Prisma.TransactionClient['asset'] };

/**
 * Records a completed preventive maintenance: last PM = when the work was
 * done, next PM = that plus the asset's interval. An older completion never
 * moves the dates backwards (late or replayed events, back-dated entries).
 */
export async function recordPmCompleted(
  db: AssetClient,
  assetId: string,
  organizationId: string,
  completedAt: Date,
): Promise<void> {
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId, deletedAt: null },
    select: { pmFrequencyDays: true },
  });
  if (!asset) return;

  const intervalDays = asset.pmFrequencyDays ?? DEFAULT_PM_INTERVAL_DAYS;
  await db.asset.updateMany({
    where: {
      id: assetId,
      organizationId,
      deletedAt: null,
      OR: [{ lastPmDate: null }, { lastPmDate: { lt: completedAt } }],
    },
    data: {
      lastPmDate: completedAt,
      nextPmDueDate: new Date(completedAt.getTime() + intervalDays * DAY_MS),
    },
  });
}
