import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AssetStatus, Prisma, WorkOrderStatus } from '@prisma/client';

import {
  changeAssetStatus,
  isStopStatus,
} from '../assets/asset-status.service';
import { describeLocation, LOCATION_SELECT } from '../assets/location';
import { recordPmCompleted } from '../assets/pm-dates';
import type { AuthUser } from '../auth/auth-user';
import { BIOMED_ROLES, normalizeRole } from '../auth/roles';
import { PrismaService } from '../database/prisma.service';
import {
  deviceForNotice,
  deviceLabel,
  HIGH_RISK,
  bestEffort,
  notify,
  type Severity,
} from '../notifications/notify';
import type {
  ListWorkOrdersQuery,
  ReportProblemDto,
  UpdateWorkOrderDto,
} from './work-order.dto';

export const OPEN_STATUSES: WorkOrderStatus[] = [
  'PENDING',
  'ASSIGNED',
  'IN_PROGRESS',
  'AWAITING_PARTS',
  'ON_HOLD',
];

/** Which status a work order may move to from each status. */
export const NEXT_STATUSES: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  PENDING: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  ASSIGNED: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['AWAITING_PARTS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
  AWAITING_PARTS: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Device statuses a completed work order may release back into use. */
const RELEASABLE = new Set(['QUARANTINED', 'IN_MAINTENANCE']);

const LIST_SELECT = {
  id: true,
  workOrderType: true,
  workOrderStatus: true,
  isEmergency: true,
  scheduledDate: true,
  startedAt: true,
  completedAt: true,
  description: true,
  workPerformed: true,
  failureCategory: true,
  createdAt: true,
  asset: {
    select: {
      id: true,
      assetTagNumber: true,
      equipmentName: true,
      assetStatus: true,
      criticalityLevel: true,
      ...LOCATION_SELECT,
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignedTechnician: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.MaintenanceHistorySelect;

type Row = Prisma.MaintenanceHistoryGetPayload<{ select: typeof LIST_SELECT }>;

const fullName = (u: { firstName: string; lastName: string } | null) =>
  u ? `${u.firstName} ${u.lastName}`.trim() : null;

function present(row: Row) {
  const { asset, createdBy, assignedTechnician, ...wo } = row;
  return {
    ...wo,
    asset: {
      id: asset.id,
      assetTagNumber: asset.assetTagNumber,
      equipmentName: asset.equipmentName,
      assetStatus: asset.assetStatus,
      criticalityLevel: asset.criticalityLevel,
      location: describeLocation(asset),
    },
    reportedBy: fullName(createdBy),
    assignedTo: assignedTechnician
      ? { id: assignedTechnician.id, name: fullName(assignedTechnician)! }
      : null,
  };
}

export type WorkOrderView = ReturnType<typeof present>;

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ward staff report a problem with a device. Opens a corrective work
   * order for biomed and, if asked, takes the device out of use at once so
   * the next person who scans it sees "Do not use".
   */
  async reportProblem(dto: ReportProblemDto, user: AuthUser) {
    const description = dto.description.trim();
    if (description.length < 5) {
      throw new BadRequestException('Describe the problem in a few words');
    }
    const where = dto.locationHint?.trim();

    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: {
          id: dto.assetId,
          organizationId: user.organizationId,
          deletedAt: null,
        },
        select: { assetStatus: true, criticalityLevel: true },
      });
      if (!asset) throw new NotFoundException('Device not found');

      const workOrder = await tx.maintenanceHistory.create({
        data: {
          assetId: dto.assetId,
          workOrderType: 'CORRECTIVE_MAINTENANCE',
          workOrderStatus: 'PENDING',
          scheduledDate: new Date(),
          description: where
            ? `${description}\n\nWhere: ${where}`
            : description,
          // A high-risk device taken out of use goes to the top of the
          // queue, and is escalated if nobody takes it on.
          isEmergency:
            (dto.takeOutOfUse ?? false) &&
            HIGH_RISK.includes(asset.criticalityLevel),
          createdByUserId: user.userId,
        },
        select: { id: true },
      });

      let takenOutOfUse = false;
      if (dto.takeOutOfUse && !isStopStatus(asset.assetStatus)) {
        const change = await changeAssetStatus(tx, {
          assetId: dto.assetId,
          organizationId: user.organizationId,
          toStatus: 'QUARANTINED',
          expectedStatus: asset.assetStatus,
          reason: `Problem reported: ${description}`.slice(0, 1000),
          source: 'FAULT_REPORT',
          changedById: user.userId,
          workOrderId: workOrder.id,
        });
        takenOutOfUse = change.changed;
      }

      const outOfUse = takenOutOfUse || isStopStatus(asset.assetStatus);
      await bestEffort(tx, 'problem report notices', () =>
        this.noticeProblemReported(tx, {
          workOrderId: workOrder.id,
          assetId: dto.assetId,
          user,
          description,
          where,
          takenOutOfUse,
          outOfUse,
          urgent:
            (dto.takeOutOfUse ?? false) &&
            HIGH_RISK.includes(asset.criticalityLevel),
        }),
      );

      return {
        workOrderId: workOrder.id,
        takenOutOfUse,
        // Already out of use counts as out of use for the reporter.
        outOfUse,
      };
    });
  }

  async list(query: ListWorkOrdersQuery, user: AuthUser) {
    const view = query.view ?? 'open';
    const where: Prisma.MaintenanceHistoryWhereInput = {
      asset: { organizationId: user.organizationId },
      ...(query.assetId ? { assetId: query.assetId } : {}),
      ...(view === 'done'
        ? { workOrderStatus: { in: ['COMPLETED', 'CANCELLED'] } }
        : { workOrderStatus: { in: OPEN_STATUSES } }),
      ...(view === 'mine' ? { assignedTechnicianId: user.userId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.maintenanceHistory.count({ where }),
      this.prisma.maintenanceHistory.findMany({
        where,
        select: LIST_SELECT,
        orderBy:
          view === 'done'
            ? [{ completedAt: 'desc' }, { scheduledDate: 'desc' }]
            : [{ isEmergency: 'desc' }, { scheduledDate: 'asc' }],
        skip: query.skip ?? 0,
        take: query.take ?? 50,
      }),
    ]);
    return { total, items: rows.map(present) };
  }

  async update(id: string, dto: UpdateWorkOrderDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.maintenanceHistory.findFirst({
        where: { id, asset: { organizationId: user.organizationId } },
        select: {
          workOrderStatus: true,
          workOrderType: true,
          startedAt: true,
          assignedTechnicianId: true,
          assetId: true,
          isEmergency: true,
          createdByUserId: true,
          description: true,
          asset: {
            select: {
              assetStatus: true,
              deletedAt: true,
              assetTagNumber: true,
              equipmentName: true,
            },
          },
        },
      });
      if (!current) throw new NotFoundException('Work order not found');
      // Closed work orders are part of the device's record: never edited.
      if (!OPEN_STATUSES.includes(current.workOrderStatus)) {
        throw new BadRequestException(
          'This work order is closed and cannot be changed. Open a new one if needed.',
        );
      }
      if (current.workOrderStatus !== dto.expectedStatus) {
        throw new ConflictException(
          'This work order was updated by someone else just now. Reload and check before trying again.',
        );
      }

      const data: Prisma.MaintenanceHistoryUncheckedUpdateManyInput = {};
      let next = current.workOrderStatus;

      if (dto.assignedTechnicianId !== undefined) {
        await this.assertTechnician(tx, dto.assignedTechnicianId, user);
        data.assignedTechnicianId = dto.assignedTechnicianId;
        // Assigning a new report moves it out of the unassigned pile.
        if (next === 'PENDING' && !dto.status) next = 'ASSIGNED';
      }

      if (dto.status && dto.status !== current.workOrderStatus) {
        if (!NEXT_STATUSES[current.workOrderStatus].includes(dto.status)) {
          throw new BadRequestException(
            `A ${current.workOrderStatus.toLowerCase().replace('_', ' ')} work order cannot move to ${dto.status.toLowerCase().replace('_', ' ')}`,
          );
        }
        next = dto.status;
      }
      data.workOrderStatus = next;

      const note = dto.workPerformed?.trim();
      const now = new Date();
      if (next === 'IN_PROGRESS' && !current.startedAt) data.startedAt = now;
      if (next === 'COMPLETED' && current.workOrderStatus !== 'COMPLETED') {
        if (!note || note.length < 5) {
          throw new BadRequestException('Say what was done before completing');
        }
        data.completedAt = now;
        data.workPerformed = note;
        if (dto.failureCategory) data.failureCategory = dto.failureCategory;
        if (!current.assignedTechnicianId && !data.assignedTechnicianId) {
          data.assignedTechnicianId = user.userId;
        }
      } else if (next === 'CANCELLED') {
        if (!note || note.length < 5) {
          throw new BadRequestException('Say why the work order is cancelled');
        }
        data.workPerformed = `Cancelled: ${note}`;
      } else if (note) {
        data.workPerformed = note;
      }

      if (dto.releaseDevice) {
        if (next !== 'COMPLETED') {
          throw new BadRequestException(
            'A device can only be released when its work order is completed',
          );
        }
        if (!dto.confirmSafe) {
          throw new BadRequestException(
            'Confirm the device has been checked and is safe to use before releasing it',
          );
        }
        // Another unresolved problem on the same device keeps it out of use.
        const otherOpen = await tx.maintenanceHistory.count({
          where: {
            assetId: current.assetId,
            id: { not: id },
            workOrderStatus: { in: OPEN_STATUSES },
          },
        });
        if (otherOpen > 0) {
          throw new BadRequestException(
            otherOpen === 1
              ? 'Another work order is still open for this device. Complete or cancel it before putting the device back into use.'
              : `${otherOpen} other work orders are still open for this device. Complete or cancel them before putting the device back into use.`,
          );
        }
        if (!RELEASABLE.has(current.asset.assetStatus)) {
          throw new BadRequestException(
            `The device is ${current.asset.assetStatus.toLowerCase().replace('_', ' ')}; change its status from its own page if needed`,
          );
        }
      }

      const { count } = await tx.maintenanceHistory.updateMany({
        where: { id, workOrderStatus: current.workOrderStatus },
        data,
      });
      if (count === 0) {
        throw new ConflictException(
          'This work order was updated by someone else just now. Reload and check before trying again.',
        );
      }

      let released = false;
      if (next === 'COMPLETED' && current.workOrderStatus !== 'COMPLETED') {
        if (current.workOrderType === 'PREVENTIVE_MAINTENANCE') {
          await recordPmCompleted(
            tx,
            current.assetId,
            user.organizationId,
            now,
          );
        }
        if (dto.releaseDevice) {
          const change = await changeAssetStatus(tx, {
            assetId: current.assetId,
            organizationId: user.organizationId,
            toStatus: 'ACTIVE',
            expectedStatus: current.asset.assetStatus,
            reason: `Work order completed: ${note}`.slice(0, 1000),
            source: 'WORK_ORDER',
            changedById: user.userId,
            workOrderId: id,
          });
          if (!change.changed) {
            throw new ConflictException(
              'The device status changed while you were completing this. Reload and check.',
            );
          }
          released = true;
        }
      }

      await bestEffort(tx, 'work order notices', () =>
        this.noticeWorkOrderChange(tx, {
          id,
          current,
          next,
          assignedTo: data.assignedTechnicianId as string | undefined,
          note,
          released,
          user,
        }),
      );

      const row = await tx.maintenanceHistory.findFirst({
        where: { id },
        select: LIST_SELECT,
      });
      return { ...present(row!), deviceReleased: released };
    });
  }

  /**
   * Biomed hears about every report on their facility's devices. An urgent
   * one (critical device, or a high-risk device taken out of use) is also
   * sent outside the app when a webhook is set up.
   */
  private async noticeProblemReported(
    tx: Prisma.TransactionClient,
    e: {
      workOrderId: string;
      assetId: string;
      user: AuthUser;
      description: string;
      where?: string;
      takenOutOfUse: boolean;
      outOfUse: boolean;
      urgent: boolean;
    },
  ) {
    const device = await deviceForNotice(tx, e.assetId, e.user.organizationId);
    if (!device) return;
    const reporter = await tx.user.findUnique({
      where: { id: e.user.userId },
      select: { firstName: true, lastName: true },
    });
    const severity: Severity = e.urgent
      ? 'critical'
      : e.outOfUse
        ? 'warning'
        : 'info';
    const place =
      e.where ??
      device.currentRoom?.roomName ??
      device.custodianDepartment?.departmentName;
    await notify(tx, {
      organizationId: e.user.organizationId,
      kind: 'problem_reported',
      severity,
      title: `${severity === 'critical' ? 'Urgent: ' : ''}${deviceLabel(device)} reported faulty`,
      body: [
        e.description,
        place ? `Where: ${place}` : null,
        `Reported by ${reporter ? `${reporter.firstName} ${reporter.lastName}`.trim() : 'staff'}${
          e.takenOutOfUse ? ' · taken out of use' : ''
        }`,
      ]
        .filter(Boolean)
        .join('\n'),
      link: '/maintenance',
      assetId: device.id,
      workOrderId: e.workOrderId,
      to: { roles: BIOMED_ROLES, facilityId: device.currentFacilityId },
      excludeUserId: e.user.userId,
      dedupeKey: `reported:${e.workOrderId}`,
      outbound: severity === 'critical',
      outboundBody: place ? `Where: ${place}` : undefined,
    });
  }

  /** Tells the assignee about new work, and the reporter how their report ended. */
  private async noticeWorkOrderChange(
    tx: Prisma.TransactionClient,
    e: {
      id: string;
      current: {
        workOrderStatus: WorkOrderStatus;
        workOrderType: string;
        assignedTechnicianId: string | null;
        assetId: string;
        isEmergency: boolean;
        createdByUserId: string;
        description: string | null;
        asset: {
          assetStatus: AssetStatus;
          assetTagNumber: string;
          equipmentName: string;
        };
      };
      next: WorkOrderStatus;
      assignedTo?: string;
      note?: string;
      released: boolean;
      user: AuthUser;
    },
  ) {
    const { current } = e;
    const label = deviceLabel(current.asset);
    const base = {
      organizationId: e.user.organizationId,
      assetId: current.assetId,
      workOrderId: e.id,
      excludeUserId: e.user.userId,
    };

    if (e.assignedTo && e.assignedTo !== current.assignedTechnicianId) {
      await notify(tx, {
        ...base,
        kind: 'assigned',
        severity: current.isEmergency ? 'critical' : 'info',
        title: `Assigned to you: ${label}`,
        body: current.description?.split('\n')[0],
        link: '/maintenance?view=mine',
        to: { userIds: [e.assignedTo] },
      });
    }

    // Reporters hear back about their problem reports, not routine PM.
    if (current.workOrderType !== 'CORRECTIVE_MAINTENANCE') return;
    if (e.next === 'COMPLETED' && current.workOrderStatus !== 'COMPLETED') {
      const stillOut = !e.released && isStopStatus(current.asset.assetStatus);
      await notify(tx, {
        ...base,
        kind: 'resolved',
        severity: 'info',
        title: e.released
          ? `Back in service: ${label}`
          : `Work finished: ${label}`,
        body: [
          e.note,
          stillOut
            ? 'It stays marked "Do not use" until biomed releases it.'
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
        link: `/assets/${current.assetId}`,
        to: { userIds: [current.createdByUserId] },
        dedupeKey: `closed:${e.id}`,
      });
    } else if (
      e.next === 'CANCELLED' &&
      current.workOrderStatus !== 'CANCELLED'
    ) {
      await notify(tx, {
        ...base,
        kind: 'cancelled',
        severity: 'info',
        title: `Your report was closed: ${label}`,
        body: e.note,
        link: `/assets/${current.assetId}`,
        to: { userIds: [current.createdByUserId] },
        dedupeKey: `closed:${e.id}`,
      });
    }
  }

  /** Biomed staff in the caller's organization who can be assigned work. */
  async technicians(user: AuthUser) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
    });
    return users
      .filter((u) => {
        const role = normalizeRole(u.role);
        return role !== null && BIOMED_ROLES.includes(role);
      })
      .map((u) => ({ id: u.id, name: fullName(u)! }));
  }

  private async assertTechnician(
    tx: Prisma.TransactionClient,
    userId: string,
    user: AuthUser,
  ) {
    const tech = await tx.user.findFirst({
      where: {
        id: userId,
        organizationId: user.organizationId,
        isActive: true,
      },
      select: { role: true },
    });
    const role = tech ? normalizeRole(tech.role) : null;
    if (!role || !BIOMED_ROLES.includes(role)) {
      throw new BadRequestException(
        'Work can only be assigned to active biomed staff in your organization',
      );
    }
  }
}
