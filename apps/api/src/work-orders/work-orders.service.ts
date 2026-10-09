import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, WorkOrderStatus } from '@prisma/client';

import {
  changeAssetStatus,
  isStopStatus,
} from '../assets/asset-status.service';
import { recordPmCompleted } from '../assets/pm-dates';
import type { AuthUser } from '../auth/auth-user';
import { BIOMED_ROLES, normalizeRole } from '../auth/roles';
import { PrismaService } from '../database/prisma.service';
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
      currentFacility: { select: { facilityName: true } },
      currentRoom: { select: { roomName: true, roomCode: true } },
      custodianDepartment: { select: { departmentName: true } },
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
      location: [
        asset.currentRoom
          ? `${asset.currentRoom.roomName} (${asset.currentRoom.roomCode})`
          : null,
        asset.custodianDepartment?.departmentName ?? null,
        asset.currentFacility?.facilityName ?? null,
      ]
        .filter(Boolean)
        .join(', '),
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
          // A critical device taken out of use goes to the top of the queue.
          isEmergency:
            dto.takeOutOfUse && asset.criticalityLevel === 'CRITICAL',
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

      return {
        workOrderId: workOrder.id,
        takenOutOfUse,
        // Already out of use counts as out of use for the reporter.
        outOfUse: takenOutOfUse || isStopStatus(asset.assetStatus),
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
          asset: { select: { assetStatus: true, deletedAt: true } },
        },
      });
      if (!current) throw new NotFoundException('Work order not found');
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

      const row = await tx.maintenanceHistory.findFirst({
        where: { id },
        select: LIST_SELECT,
      });
      return { ...present(row!), deviceReleased: released };
    });
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
