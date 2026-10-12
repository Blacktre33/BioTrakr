import type {
  AssetStatus,
  CriticalityLevel,
  DeviceCategory,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';

const HOUR = 3.6e6;

/** A breakdown: a problem reported on the ward, or an emergency repair. */
export const BREAKDOWN_TYPES: WorkOrderType[] = [
  'CORRECTIVE_MAINTENANCE',
  'EMERGENCY_REPAIR',
];

/** Out of use: being repaired, or held back after a fault. */
const DOWN: AssetStatus[] = ['QUARANTINED', 'IN_MAINTENANCE'];
/** No longer in service: counts neither as up nor as down. */
const GONE: AssetStatus[] = ['CONDEMNED', 'RETIRED', 'DISPOSED'];

/** Settings, read when used so tests and restarts pick up changes. */
export function downtimeConfig() {
  const num = (v: string | undefined, fallback: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= max ? n : fallback;
  };
  return {
    /** BMMP Model RFP: critical and life-saving equipment back within 72 hours… */
    criticalHours: num(process.env.DOWNTIME_LIMIT_CRITICAL_HOURS, 72, 720),
    /** …everything else within 7 days. */
    otherHours: num(process.env.DOWNTIME_LIMIT_OTHER_HOURS, 168, 2160),
    /** NHSRC: 95% at district hospitals, 90% at CHCs, 80% at PHCs. */
    targetPercent: num(process.env.UPTIME_TARGET_PERCENT, 95, 100),
  };
}

/** Biomed is warned when a repair has used this share of its limit. */
export const NEARING = 0.75;

/** Critical and life-saving equipment: high-risk devices and life support. */
export const isLifeSaving = (d: {
  criticalityLevel: CriticalityLevel;
  deviceCategory: DeviceCategory;
}) =>
  d.criticalityLevel === 'CRITICAL' ||
  d.criticalityLevel === 'HIGH' ||
  d.deviceCategory === 'LIFE_SUPPORT';

/** How long a repair of this device may take, in hours. */
export function repairLimitHours(d: {
  criticalityLevel: CriticalityLevel;
  deviceCategory: DeviceCategory;
}): number {
  const c = downtimeConfig();
  return isLifeSaving(d) ? c.criticalHours : c.otherHours;
}

export interface BreakdownClock {
  /** Still waiting to be put right. */
  open: boolean;
  /** Reported to now (open) or to rectified. */
  hours: number;
  /** Reported to someone starting work; null until then. */
  attendHours: number | null;
  limitHours: number;
  /** Hours left before the limit (negative: over by that much). */
  leftHours: number;
  state: 'within' | 'nearing' | 'over';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A breakdown's clock: from the report to the device being put right,
 * against the limit for its kind of equipment. Null for cancelled reports
 * and for other work.
 */
export function breakdownClock(
  wo: {
    workOrderType: WorkOrderType;
    workOrderStatus: WorkOrderStatus;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  },
  device: {
    criticalityLevel: CriticalityLevel;
    deviceCategory: DeviceCategory;
  },
  now: Date = new Date(),
): BreakdownClock | null {
  if (!BREAKDOWN_TYPES.includes(wo.workOrderType)) return null;
  if (wo.workOrderStatus === 'CANCELLED') return null;
  const open = wo.workOrderStatus !== 'COMPLETED' || !wo.completedAt;
  const end = open ? now : wo.completedAt!;
  const hours = Math.max(0, (end.getTime() - wo.createdAt.getTime()) / HOUR);
  // Completed without being started: attended when it was put right.
  const attended = wo.startedAt ?? (open ? null : wo.completedAt);
  const limitHours = repairLimitHours(device);
  return {
    open,
    hours: round1(hours),
    attendHours: attended
      ? round1(
          Math.max(0, (attended.getTime() - wo.createdAt.getTime()) / HOUR),
        )
      : null,
    limitHours,
    leftHours: round1(limitHours - hours),
    state:
      hours > limitHours
        ? 'over'
        : open && hours >= limitHours * NEARING
          ? 'nearing'
          : 'within',
  };
}

export interface DeviceTime {
  /** Hours the device was in service (up or down) within the period. */
  serviceHours: number;
  /** Of those, hours it was out of use. */
  downHours: number;
}

/**
 * How long a device was in service and how long out of use within a
 * period, from its status history (oldest first). Time before it was
 * registered, and time condemned, retired or disposed, counts for neither.
 */
export function deviceTime(
  device: { createdAt: Date; assetStatus: AssetStatus },
  changes: Array<{
    changedAt: Date;
    fromStatus: AssetStatus;
    toStatus: AssetStatus;
  }>,
  from: Date,
  to: Date,
): DeviceTime {
  const start = Math.max(from.getTime(), device.createdAt.getTime());
  const end = to.getTime();
  if (start >= end) return { serviceHours: 0, downHours: 0 };

  // The status at the start: the last change before it, else the status
  // the first later change moved from, else the status now.
  const before = changes.filter((c) => c.changedAt.getTime() <= start);
  const after = changes.filter(
    (c) => c.changedAt.getTime() > start && c.changedAt.getTime() < end,
  );
  let status: AssetStatus =
    before.at(-1)?.toStatus ?? after[0]?.fromStatus ?? device.assetStatus;

  let service = 0;
  let down = 0;
  let at = start;
  const add = (until: number) => {
    const span = until - at;
    if (!GONE.includes(status)) service += span;
    if (DOWN.includes(status)) down += span;
    at = until;
  };
  for (const c of after) {
    add(c.changedAt.getTime());
    status = c.toStatus;
  }
  add(end);
  return { serviceHours: service / HOUR, downHours: down / HOUR };
}

/** Uptime as a percentage of time in service, to one decimal; null with no time in service. */
export const uptimePercent = (t: DeviceTime) =>
  t.serviceHours > 0
    ? round1(((t.serviceHours - t.downHours) / t.serviceHours) * 100)
    : null;
