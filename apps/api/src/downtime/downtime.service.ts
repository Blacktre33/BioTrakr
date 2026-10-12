import { Injectable, Logger } from '@nestjs/common';
import type { AssetStatus, Prisma } from '@prisma/client';

import { BIOMED_ROLES } from '../auth/roles';
import { PrismaService } from '../database/prisma.service';
import { bestEffort, deviceLabel, notify } from '../notifications/notify';
import {
  BREAKDOWN_TYPES,
  breakdownClock,
  type BreakdownClock,
  deviceTime,
  downtimeConfig,
  isLifeSaving,
  NEARING,
  repairLimitHours,
  uptimePercent,
} from './downtime';

const HOUR = 3.6e6;
/** A hospital's devices fit; beyond this the figures are cut short. */
const MAX_DEVICES = 20_000;
const FUNCTIONAL: AssetStatus[] = ['ACTIVE', 'IN_SERVICE'];
const GONE: AssetStatus[] = ['CONDEMNED', 'RETIRED', 'DISPOSED'];
const OPEN: Prisma.MaintenanceHistoryWhereInput['workOrderStatus'] = {
  in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_PARTS', 'ON_HOLD'],
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) =>
  xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null;

export interface DeviceUptime {
  id: string;
  assetTagNumber: string;
  equipmentName: string;
  department: string | null;
  lifeSaving: boolean;
  /** How long a repair may take. */
  limitHours: number;
  serviceHours: number;
  downHours: number;
  uptimePercent: number | null;
  /** Reported within the period. */
  breakdowns: number;
  /** The longest of those, so far if still open. */
  longestHours: number | null;
  /** Of those, how many ran past their limit. */
  overLimit: number;
}

/** A repair limit as BMMP states it: "72 h", "7 days". */
export const limitText = (hours: number) =>
  hours > 72 && hours % 24 === 0 ? `${hours / 24} days` : `${hours} h`;

/** "3 days 4 h", "5.5 h". */
export function hoursText(h: number): string {
  if (h < 48) return `${round1(h)} h`;
  const days = Math.floor(h / 24);
  const rest = Math.round(h - days * 24);
  return rest ? `${days} days ${rest} h` : `${days} days`;
}

/**
 * How long equipment is out of use and how long repairs take: uptime over
 * a period (from each device's status history), the census figure NHSRC
 * reports, and each breakdown's clock against BMMP's limits (72 hours for
 * critical and life-saving equipment, 7 days for the rest).
 */
@Injectable()
export class DowntimeService {
  private readonly logger = new Logger('Downtime');

  constructor(private readonly prisma: PrismaService) {}

  private where(organizationId: string, facilityId?: string) {
    return {
      organizationId,
      deletedAt: null,
      ...(facilityId ? { currentFacilityId: facilityId } : {}),
    } satisfies Prisma.AssetWhereInput;
  }

  /** Uptime over a period, device by device and overall. */
  async uptime(
    scope: { organizationId: string; facilityId?: string },
    from: Date,
    to: Date,
    now: Date = new Date(),
  ) {
    const devices = this.where(scope.organizationId, scope.facilityId);
    const [assets, breakdowns] = await Promise.all([
      this.prisma.asset.findMany({
        where: { ...devices, createdAt: { lte: to } },
        orderBy: { assetTagNumber: 'asc' },
        take: MAX_DEVICES,
        select: {
          id: true,
          assetTagNumber: true,
          equipmentName: true,
          criticalityLevel: true,
          deviceCategory: true,
          assetStatus: true,
          createdAt: true,
          custodianDepartment: { select: { departmentName: true } },
          statusChanges: {
            where: { changedAt: { lte: to } },
            orderBy: { changedAt: 'asc' },
            select: { changedAt: true, fromStatus: true, toStatus: true },
          },
        },
      }),
      this.prisma.maintenanceHistory.findMany({
        where: {
          asset: devices,
          workOrderType: { in: BREAKDOWN_TYPES },
          workOrderStatus: { not: 'CANCELLED' },
          OR: [
            { createdAt: { gte: from, lte: to } },
            { completedAt: { gte: from, lte: to } },
          ],
        },
        select: {
          assetId: true,
          workOrderType: true,
          workOrderStatus: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
        },
        take: MAX_DEVICES * 5,
      }),
    ]);

    const end = to.getTime() < now.getTime() ? to : now;
    const byId = new Map(assets.map((a) => [a.id, a]));
    const clocks = breakdowns
      .map((b) => {
        const asset = byId.get(b.assetId);
        const clock = asset ? breakdownClock(b, asset, now) : null;
        return clock && { ...b, clock };
      })
      .filter(<T>(x: T | null): x is T => x !== null);
    const reported = clocks.filter((b) => b.createdAt >= from);

    const perDevice: DeviceUptime[] = assets.map((a) => {
      const time = deviceTime(a, a.statusChanges, from, end);
      const mine = reported.filter((b) => b.assetId === a.id);
      return {
        id: a.id,
        assetTagNumber: a.assetTagNumber,
        equipmentName: a.equipmentName,
        department: a.custodianDepartment?.departmentName ?? null,
        lifeSaving: isLifeSaving(a),
        limitHours: repairLimitHours(a),
        serviceHours: round1(time.serviceHours),
        downHours: round1(time.downHours),
        uptimePercent: uptimePercent(time),
        breakdowns: mine.length,
        longestHours: mine.length
          ? Math.max(...mine.map((b) => b.clock.hours))
          : null,
        overLimit: mine.filter((b) => b.clock.state === 'over').length,
      };
    });

    const service = perDevice.reduce((s, d) => s + d.serviceHours, 0);
    const down = perDevice.reduce((s, d) => s + d.downHours, 0);
    const restored = clocks.filter(
      (b) => !b.clock.open && b.completedAt! >= from && b.completedAt! <= to,
    );
    const inService = assets.filter((a) => !GONE.includes(a.assetStatus));
    return {
      from,
      to,
      devices: perDevice,
      totals: {
        serviceHours: round1(service),
        downHours: round1(down),
        uptimePercent: uptimePercent({
          serviceHours: service,
          downHours: down,
        }),
        /** NHSRC census: devices working now, of those in service. */
        censusPercent: inService.length
          ? round1(
              (inService.filter((a) => FUNCTIONAL.includes(a.assetStatus))
                .length /
                inService.length) *
                100,
            )
          : null,
        targetPercent: downtimeConfig().targetPercent,
        breakdowns: reported.length,
        /** Report to rectified, for repairs finished in the period. */
        mttrHours: mean(restored.map((b) => b.clock.hours)),
        /** Report to someone starting work. */
        meanAttendHours: mean(
          restored
            .map((b) => b.clock.attendHours)
            .filter((h): h is number => h !== null),
        ),
        /** Hours in use between breakdowns. */
        mtbfHours: reported.length
          ? round1((service - down) / reported.length)
          : null,
        overLimit: reported.filter((b) => b.clock.state === 'over').length,
      },
    };
  }

  /** Breakdowns still open: how long they have waited, against their limits. */
  async open(
    scope: { organizationId: string; facilityId?: string },
    now: Date = new Date(),
  ) {
    const rows = await this.prisma.maintenanceHistory.findMany({
      where: {
        asset: this.where(scope.organizationId, scope.facilityId),
        workOrderType: { in: BREAKDOWN_TYPES },
        workOrderStatus: OPEN,
      },
      select: {
        workOrderType: true,
        workOrderStatus: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        asset: { select: { criticalityLevel: true, deviceCategory: true } },
      },
      take: MAX_DEVICES,
    });
    const clocks = rows
      .map((r) => breakdownClock(r, r.asset, now))
      .filter((c): c is BreakdownClock => c !== null);
    const count = (lo: number, hi: number) =>
      clocks.filter((c) => c.hours >= lo && c.hours < hi).length;
    return {
      total: clocks.length,
      nearing: clocks.filter((c) => c.state === 'nearing').length,
      over: clocks.filter((c) => c.state === 'over').length,
      ageing: {
        underOneDay: count(0, 24),
        oneToThreeDays: count(24, 72),
        threeToSevenDays: count(72, 168),
        overSevenDays: count(168, Infinity),
      },
    };
  }

  /**
   * Warns biomed when a repair has used three quarters of its limit, and
   * again (urgently, outside the app too for life-saving equipment) when
   * the limit has passed. Each warning goes once per breakdown.
   */
  async checkLimits(now: Date = new Date()): Promise<void> {
    const { criticalHours, otherHours } = downtimeConfig();
    const soonest = Math.min(criticalHours, otherHours) * NEARING;
    const rows = await this.prisma.maintenanceHistory.findMany({
      where: {
        workOrderType: { in: BREAKDOWN_TYPES },
        workOrderStatus: OPEN,
        createdAt: { lte: new Date(now.getTime() - soonest * HOUR) },
        asset: { deletedAt: null },
      },
      select: {
        id: true,
        workOrderType: true,
        workOrderStatus: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        asset: {
          select: {
            id: true,
            organizationId: true,
            currentFacilityId: true,
            assetTagNumber: true,
            equipmentName: true,
            criticalityLevel: true,
            deviceCategory: true,
            assetStatus: true,
          },
        },
      },
      take: MAX_DEVICES,
    });
    for (const wo of rows) {
      const clock = breakdownClock(wo, wo.asset, now);
      if (!clock || clock.state === 'within') continue;
      const over = clock.state === 'over';
      const label = deviceLabel(wo.asset);
      const lifeSaving = isLifeSaving(wo.asset);
      await this.prisma.$transaction((tx) =>
        bestEffort(tx, 'repair limit notice', () =>
          notify(tx, {
            organizationId: wo.asset.organizationId,
            kind: 'downtime_limit',
            severity: over ? 'critical' : 'warning',
            title: over
              ? `Repair limit passed: ${label}`
              : `Repair limit near: ${label}`,
            body: [
              `Reported ${hoursText(clock.hours)} ago; ${
                lifeSaving
                  ? 'critical and life-saving equipment'
                  : 'this equipment'
              } should be back within ${limitText(clock.limitHours)}.`,
              over
                ? `Over by ${hoursText(-clock.leftHours)}.`
                : `${hoursText(clock.leftHours)} left.`,
              clock.attendHours === null
                ? 'Nobody has started work yet.'
                : null,
            ]
              .filter(Boolean)
              .join('\n'),
            link: '/maintenance',
            assetId: wo.asset.id,
            workOrderId: wo.id,
            to: { roles: BIOMED_ROLES, facilityId: wo.asset.currentFacilityId },
            dedupeKey: `downtime-${clock.state}:${wo.id}`,
            outbound: over && lifeSaving,
          }),
        ),
      );
    }
  }
}
