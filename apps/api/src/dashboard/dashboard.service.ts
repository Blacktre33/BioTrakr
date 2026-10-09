import { Injectable } from '@nestjs/common';
import type { AssetStatus, CriticalityLevel, Prisma } from '@prisma/client';

import {
  OUT_OF_USE_STATUSES,
  RETIRED_STATUSES,
} from '../assets/asset-status.service';
import { describeLocation, LOCATION_SELECT } from '../assets/location';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { OPEN_STATUSES } from '../work-orders/work-orders.service';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
/** PM falling due within this many days counts as "due soon". */
export const DUE_SOON_DAYS = 30;
/** Time to repair is averaged over repairs finished in this window. */
export const REPAIR_WINDOW_DAYS = 90;
/** Weeks of opened / completed work orders in the trend. */
export const TREND_WEEKS = 8;
const LIST_SIZE = 10;
/** Enough rows for a busy hospital's trend; beyond it the trend is cut short, not wrong. */
const MAX_ROWS = 20_000;

const ASSET_STATUSES: AssetStatus[] = [
  'ACTIVE',
  'IN_SERVICE',
  'IN_MAINTENANCE',
  'QUARANTINED',
  'CONDEMNED',
  'RETIRED',
  'DISPOSED',
];
const RISK_ORDER: CriticalityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/** Monday 00:00 UTC of the week containing `at`. */
export function weekStart(at: Date): Date {
  const day = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY);
}

const hours = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3.6e6;
const round1 = (n: number) => Math.round(n * 10) / 10;

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * What biomed needs at a glance: which devices are out of use, which are
   * overdue for preventive maintenance, the work waiting, and how long
   * repairs take. Everything is counted live from the database.
   */
  async summary(query: { facilityId?: string }, user: AuthUser) {
    const now = new Date();
    const atFacility = query.facilityId
      ? { currentFacilityId: query.facilityId }
      : {};
    const devices: Prisma.AssetWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...atFacility,
    };
    // Retired, condemned and disposed devices are history, not stock.
    const inService: Prisma.AssetWhereInput = {
      ...devices,
      assetStatus: { notIn: RETIRED_STATUSES },
    };
    const pmScheduled: Prisma.AssetWhereInput = {
      ...inService,
      nextPmDueDate: { not: null },
    };
    const workOrders: Prisma.MaintenanceHistoryWhereInput = {
      asset: { organizationId: user.organizationId, ...atFacility },
    };
    const open: Prisma.MaintenanceHistoryWhereInput = {
      ...workOrders,
      workOrderStatus: { in: OPEN_STATUSES },
    };
    const trendFrom = new Date(
      weekStart(now).getTime() - (TREND_WEEKS - 1) * WEEK,
    );

    const [
      byStatusRows,
      scheduled,
      overdue,
      dueSoon,
      notScheduled,
      outOfUseList,
      overdueList,
      openCount,
      urgent,
      unassigned,
      awaitingParts,
      opened,
      completed,
      repairs,
    ] = await Promise.all([
      this.prisma.asset.groupBy({
        by: ['assetStatus'],
        where: devices,
        _count: { _all: true },
      }),
      this.prisma.asset.count({ where: pmScheduled }),
      this.prisma.asset.count({
        where: { ...pmScheduled, nextPmDueDate: { lt: now } },
      }),
      this.prisma.asset.count({
        where: {
          ...pmScheduled,
          nextPmDueDate: {
            gte: now,
            lt: new Date(now.getTime() + DUE_SOON_DAYS * DAY),
          },
        },
      }),
      this.prisma.asset.count({ where: { ...inService, nextPmDueDate: null } }),
      this.prisma.asset.findMany({
        where: { ...devices, assetStatus: { in: OUT_OF_USE_STATUSES } },
        select: {
          id: true,
          assetTagNumber: true,
          equipmentName: true,
          assetStatus: true,
          criticalityLevel: true,
          ...LOCATION_SELECT,
          statusChanges: {
            orderBy: { changedAt: 'desc' },
            take: 1,
            select: { changedAt: true },
          },
        },
        // Highest risk first (the enum is declared CRITICAL → LOW).
        orderBy: [{ criticalityLevel: 'asc' }, { updatedAt: 'asc' }],
        take: LIST_SIZE,
      }),
      this.prisma.asset.findMany({
        where: { ...pmScheduled, nextPmDueDate: { lt: now } },
        select: {
          id: true,
          assetTagNumber: true,
          equipmentName: true,
          criticalityLevel: true,
          nextPmDueDate: true,
          ...LOCATION_SELECT,
          maintenanceHistory: {
            where: {
              workOrderType: 'PREVENTIVE_MAINTENANCE',
              workOrderStatus: { in: OPEN_STATUSES },
            },
            select: { id: true, workOrderStatus: true },
            take: 1,
          },
        },
        orderBy: [{ nextPmDueDate: 'asc' }, { id: 'asc' }],
        take: LIST_SIZE,
      }),
      this.prisma.maintenanceHistory.count({ where: open }),
      this.prisma.maintenanceHistory.count({
        where: { ...open, isEmergency: true },
      }),
      this.prisma.maintenanceHistory.count({
        where: { ...open, assignedTechnicianId: null },
      }),
      this.prisma.maintenanceHistory.count({
        where: { ...open, workOrderStatus: 'AWAITING_PARTS' },
      }),
      this.prisma.maintenanceHistory.findMany({
        where: { ...workOrders, createdAt: { gte: trendFrom } },
        select: { createdAt: true },
        take: MAX_ROWS,
      }),
      this.prisma.maintenanceHistory.findMany({
        where: {
          ...workOrders,
          workOrderStatus: 'COMPLETED',
          completedAt: { gte: trendFrom },
        },
        select: { completedAt: true },
        take: MAX_ROWS,
      }),
      this.prisma.maintenanceHistory.findMany({
        where: {
          ...workOrders,
          workOrderType: 'CORRECTIVE_MAINTENANCE',
          workOrderStatus: 'COMPLETED',
          completedAt: {
            gte: new Date(now.getTime() - REPAIR_WINDOW_DAYS * DAY),
          },
        },
        select: { createdAt: true, completedAt: true },
        take: MAX_ROWS,
      }),
    ]);

    const byStatus = Object.fromEntries(
      ASSET_STATUSES.map((s) => [s, 0]),
    ) as Record<AssetStatus, number>;
    for (const row of byStatusRows) {
      byStatus[row.assetStatus] = row._count._all;
    }
    const total = ASSET_STATUSES.filter(
      (s) => !RETIRED_STATUSES.includes(s),
    ).reduce((sum, s) => sum + byStatus[s], 0);
    const outOfUse = OUT_OF_USE_STATUSES.reduce(
      (sum, s) => sum + byStatus[s],
      0,
    );

    const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => ({
      weekStart: new Date(trendFrom.getTime() + i * WEEK).toISOString(),
      opened: 0,
      completed: 0,
    }));
    const bucket = (at: Date | null) =>
      at
        ? weeks[Math.floor((at.getTime() - trendFrom.getTime()) / WEEK)]
        : undefined;
    for (const row of opened) {
      const week = bucket(row.createdAt);
      if (week) week.opened++;
    }
    for (const row of completed) {
      const week = bucket(row.completedAt);
      if (week) week.completed++;
    }

    const repairHours = repairs
      .filter((r) => r.completedAt)
      .map((r) => Math.max(0, hours(r.createdAt, r.completedAt!)))
      .sort((a, b) => a - b);

    return {
      generatedAt: now.toISOString(),
      devices: {
        total,
        inUse: byStatus.ACTIVE + byStatus.IN_SERVICE,
        outOfUse,
        byStatus,
        outOfUseList: outOfUseList
          .map(
            ({
              statusChanges,
              currentFacility,
              currentRoom,
              custodianDepartment,
              ...a
            }) => ({
              ...a,
              location: describeLocation({
                currentFacility,
                currentRoom,
                custodianDepartment,
              }),
              since: statusChanges[0]?.changedAt ?? null,
            }),
          )
          .sort(
            (a, b) =>
              RISK_ORDER.indexOf(a.criticalityLevel) -
                RISK_ORDER.indexOf(b.criticalityLevel) ||
              (a.since?.getTime() ?? 0) - (b.since?.getTime() ?? 0),
          ),
      },
      pm: {
        scheduled,
        overdue,
        dueSoon,
        dueSoonDays: DUE_SOON_DAYS,
        notScheduled,
        /** Share of scheduled devices that are not overdue; null when none are scheduled. */
        compliancePercent: scheduled
          ? round1(((scheduled - overdue) / scheduled) * 100)
          : null,
        overdueList: overdueList.map(
          ({
            maintenanceHistory,
            nextPmDueDate,
            currentFacility,
            currentRoom,
            custodianDepartment,
            ...a
          }) => ({
            ...a,
            location: describeLocation({
              currentFacility,
              currentRoom,
              custodianDepartment,
            }),
            nextPmDueDate,
            daysOverdue: Math.floor(
              (now.getTime() - nextPmDueDate!.getTime()) / DAY,
            ),
            openWorkOrder: maintenanceHistory[0] ?? null,
          }),
        ),
      },
      workOrders: {
        open: openCount,
        urgent,
        unassigned,
        awaitingParts,
        weekly: weeks,
      },
      repairs: {
        windowDays: REPAIR_WINDOW_DAYS,
        completed: repairHours.length,
        /** Report to completion, in hours (mean time to repair). */
        meanHours: repairHours.length
          ? round1(repairHours.reduce((s, h) => s + h, 0) / repairHours.length)
          : null,
        medianHours: repairHours.length ? round1(median(repairHours)) : null,
      },
    };
  }
}
