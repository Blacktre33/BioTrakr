import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { RETIRED_STATUSES } from '../assets/asset-status.service';
import { describeLocation, LOCATION_SELECT } from '../assets/location';
import { DEFAULT_PM_INTERVAL_DAYS } from '../assets/pm-dates';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { formatDay, OPEN_PM, PM_SCHEDULED, pmConfig } from './pm-jobs.service';
import type { PmScheduleQuery } from './pm.dto';

const DAY = 24 * 60 * 60 * 1000;
/** A quarter: enough for a month view with the weeks either side. */
export const MAX_RANGE_DAYS = 93;
const MAX_ITEMS = 2000;
const MAX_OVERDUE = 200;

const fullName = (u: { firstName: string; lastName: string } | null) =>
  u ? `${u.firstName} ${u.lastName}`.trim() : null;

const DEVICE_SELECT = {
  id: true,
  assetTagNumber: true,
  equipmentName: true,
  criticalityLevel: true,
  assetStatus: true,
  nextPmDueDate: true,
  pmFrequencyDays: true,
  ...LOCATION_SELECT,
  maintenanceHistory: {
    where: OPEN_PM,
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      workOrderStatus: true,
      scheduledDate: true,
      assignedTechnician: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.AssetSelect;

type DeviceRow = Prisma.AssetGetPayload<{ select: typeof DEVICE_SELECT }>;

function present(row: DeviceRow) {
  const {
    maintenanceHistory,
    currentFacility,
    currentRoom,
    custodianDepartment,
    nextPmDueDate,
    pmFrequencyDays,
    ...device
  } = row;
  const wo = maintenanceHistory[0];
  return {
    ...device,
    location: describeLocation({
      currentFacility,
      currentRoom,
      custodianDepartment,
    }),
    dueDate: nextPmDueDate!,
    intervalDays: pmFrequencyDays ?? DEFAULT_PM_INTERVAL_DAYS,
    workOrder: wo
      ? {
          id: wo.id,
          status: wo.workOrderStatus,
          scheduledDate: wo.scheduledDate,
          assignedTo: fullName(wo.assignedTechnician),
        }
      : null,
  };
}

@Injectable()
export class PmService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The PM calendar for a date range: devices falling due in it (with their
   * open work order, if any), PM completed in it, and everything overdue now.
   */
  async schedule(query: PmScheduleQuery, user: AuthUser) {
    const { from, to } = query;
    if (to <= from) {
      throw new BadRequestException('"to" must be after "from"');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY) {
      throw new BadRequestException(
        `Ask for at most ${MAX_RANGE_DAYS} days at a time`,
      );
    }
    const now = new Date();
    const devices: Prisma.AssetWhereInput = {
      ...PM_SCHEDULED,
      organizationId: user.organizationId,
      ...(query.facilityId ? { currentFacilityId: query.facilityId } : {}),
    };
    const overdue: Prisma.AssetWhereInput = {
      ...devices,
      nextPmDueDate: { lt: now },
    };

    const [due, overdueRows, overdueTotal, done] = await Promise.all([
      this.prisma.asset.findMany({
        where: { ...devices, nextPmDueDate: { gte: from, lt: to } },
        select: DEVICE_SELECT,
        orderBy: [{ nextPmDueDate: 'asc' }, { id: 'asc' }],
        take: MAX_ITEMS,
      }),
      this.prisma.asset.findMany({
        where: overdue,
        select: DEVICE_SELECT,
        orderBy: [{ nextPmDueDate: 'asc' }, { id: 'asc' }],
        take: MAX_OVERDUE,
      }),
      this.prisma.asset.count({ where: overdue }),
      this.prisma.maintenanceHistory.findMany({
        where: {
          workOrderType: 'PREVENTIVE_MAINTENANCE',
          workOrderStatus: 'COMPLETED',
          completedAt: { gte: from, lt: to },
          asset: {
            organizationId: user.organizationId,
            ...(query.facilityId
              ? { currentFacilityId: query.facilityId }
              : {}),
          },
        },
        select: {
          id: true,
          completedAt: true,
          assignedTechnician: { select: { firstName: true, lastName: true } },
          asset: {
            select: { id: true, assetTagNumber: true, equipmentName: true },
          },
        },
        orderBy: { completedAt: 'asc' },
        take: MAX_ITEMS,
      }),
    ]);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      leadDays: pmConfig().leadDays,
      due: due.map(present),
      overdue: { total: overdueTotal, items: overdueRows.map(present) },
      done: done.map(({ assignedTechnician, ...wo }) => ({
        ...wo,
        doneBy: fullName(assignedTechnician),
      })),
      /** Lists were cut at their limit. */
      truncated: due.length === MAX_ITEMS || done.length === MAX_ITEMS,
    };
  }

  /** Biomed opens a PM work order now, without waiting for the schedule. */
  async openWorkOrder(assetId: string, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      // Two people pressing at once: the second waits here, then sees the first's.
      await tx.$queryRaw`SELECT id FROM "assets" WHERE id = ${assetId} FOR UPDATE`;
      const asset = await tx.asset.findFirst({
        where: {
          id: assetId,
          organizationId: user.organizationId,
          deletedAt: null,
        },
        select: {
          assetStatus: true,
          nextPmDueDate: true,
          pmProcedureDocument: true,
        },
      });
      if (!asset) throw new NotFoundException('Device not found');
      if (RETIRED_STATUSES.includes(asset.assetStatus)) {
        throw new BadRequestException(
          'This device is no longer in service; it needs no PM',
        );
      }
      const existing = await tx.maintenanceHistory.findFirst({
        where: { assetId, ...OPEN_PM },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          message: 'A PM work order is already open for this device',
          workOrderId: existing.id,
        });
      }

      const now = new Date();
      const due = asset.nextPmDueDate;
      const workOrder = await tx.maintenanceHistory.create({
        data: {
          assetId,
          workOrderType: 'PREVENTIVE_MAINTENANCE',
          workOrderStatus: 'PENDING',
          scheduledDate: due && due > now ? due : now,
          description: [
            due
              ? `Preventive maintenance due ${formatDay(due)}`
              : 'Preventive maintenance',
            asset.pmProcedureDocument
              ? `Procedure: ${asset.pmProcedureDocument}`
              : null,
          ]
            .filter(Boolean)
            .join('\n'),
          createdByUserId: user.userId,
        },
        select: { id: true },
      });
      return { workOrderId: workOrder.id };
    });
  }
}
