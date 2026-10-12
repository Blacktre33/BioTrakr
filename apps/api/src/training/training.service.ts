import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  actorOf,
  audit,
  auditedTransaction,
  type Change,
} from '../audit/audit';
import { changesBetween, words } from '../audit/changes';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { documentCounts } from '../documents/documents.service';
import { assessmentText } from './assessment';
import type { TrainingInputDto } from './training.dto';

type Tx = Prisma.TransactionClient;

const SELECT = {
  id: true,
  heldOn: true,
  kind: true,
  topic: true,
  equipment: true,
  trainer: true,
  trainerFrom: true,
  durationHours: true,
  notes: true,
  recordedAt: true,
  recordedBy: { select: { firstName: true, lastName: true } },
  devices: {
    select: {
      asset: {
        select: { id: true, assetTagNumber: true, equipmentName: true },
      },
    },
  },
  attendees: {
    orderBy: { name: 'asc' },
    select: {
      name: true,
      designation: true,
      department: true,
      assessment: true,
    },
  },
} satisfies Prisma.TrainingSessionSelect;

type Row = Prisma.TrainingSessionGetPayload<{ select: typeof SELECT }>;

const present = (
  { recordedBy, devices, durationHours, ...row }: Row,
  files: number,
) => ({
  ...row,
  durationHours: durationHours === null ? null : Number(durationHours),
  recordedBy: `${recordedBy.firstName} ${recordedBy.lastName}`.trim(),
  devices: devices
    .map((d) => d.asset)
    .sort((a, b) => a.assetTagNumber.localeCompare(b.assetTagNumber)),
  files,
});

/** Who attended, to tell whether the list changed. */
const who = (
  list: Array<{
    name: string;
    designation?: string | null;
    department?: string | null;
  }>,
) =>
  list
    .map((a) => [a.name, a.designation ?? '', a.department ?? ''].join('|'))
    .sort()
    .join('\n');

/** "2026-10-08" is that day here. */
function localDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
}

/**
 * Training on medical equipment (NABH FMS.5.e): each session, the
 * equipment and devices it covered, the trainer, and who attended as on
 * the attendance sheet, with how each was assessed. Attendees are named,
 * not linked to accounts: ward staff often have none. Names are personal
 * details, so the edit history records how many attended, not who.
 */
@Injectable()
export class TrainingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, assetId?: string) {
    const rows = await this.prisma.trainingSession.findMany({
      where: {
        organizationId: user.organizationId,
        ...(assetId ? { devices: { some: { assetId } } } : {}),
      },
      orderBy: [{ heldOn: 'desc' }, { id: 'asc' }],
      take: 200,
      select: SELECT,
    });
    const files = await documentCounts(
      this.prisma,
      'trainingSessionId',
      rows.map((r) => r.id),
    );
    return rows.map((r) => present(r, files.get(r.id) ?? 0));
  }

  async create(dto: TrainingInputDto, user: AuthUser) {
    const heldOn = this.check(dto);
    return auditedTransaction(this.prisma, async (tx) => {
      await this.devicesFound(tx, dto.deviceIds, user);
      const session = await tx.trainingSession.create({
        data: {
          organizationId: user.organizationId,
          ...this.details(dto, heldOn),
          recordedById: user.userId,
        },
        select: { id: true },
      });
      await this.replaceParts(tx, session.id, dto);
      audit(tx, actorOf(user), {
        action: 'training.recorded',
        entityType: 'training',
        entityId: session.id,
        // On the device's own history when it is about one device.
        assetId: dto.deviceIds.length === 1 ? dto.deviceIds[0] : null,
        summary: `Recorded ${words(dto.kind).toLowerCase()} training on ${dto.equipment}: ${dto.topic} (${dto.attendees.length} attended)`,
      });
      return this.one(tx, session.id);
    });
  }

  /** Replaces a session's details, devices and attendees. */
  async update(id: string, dto: TrainingInputDto, user: AuthUser) {
    const heldOn = this.check(dto);
    return auditedTransaction(this.prisma, async (tx) => {
      const before = await tx.trainingSession.findFirst({
        where: { id, organizationId: user.organizationId },
        select: {
          heldOn: true,
          kind: true,
          topic: true,
          equipment: true,
          trainer: true,
          trainerFrom: true,
          durationHours: true,
          notes: true,
          devices: { select: { asset: { select: { assetTagNumber: true } } } },
          attendees: {
            select: {
              name: true,
              designation: true,
              department: true,
              assessment: true,
            },
          },
        },
      });
      if (!before) throw new NotFoundException('Training not found');
      const tags = await this.devicesFound(tx, dto.deviceIds, user);
      const data = this.details(dto, heldOn);
      await tx.trainingSession.updateMany({
        where: { id, organizationId: user.organizationId },
        data,
      });
      await this.replaceParts(tx, id, dto);

      const { devices, attendees, ...was } = before;
      const changes: Change[] = await changesBetween(tx, was, data);
      const tagsBefore = devices.map((d) => d.asset.assetTagNumber).sort();
      if (tagsBefore.join() !== tags.join()) {
        changes.push({
          field: 'devices',
          label: 'Devices covered',
          from: tagsBefore.join(', ') || null,
          to: tags.join(', ') || null,
        });
      }
      const nowAttended = dto.attendees.map((a) => ({
        assessment: a.assessment ?? 'NOT_ASSESSED',
      }));
      const [from, to] = [
        assessmentText(attendees),
        assessmentText(nowAttended),
      ];
      if (attendees.length !== nowAttended.length || from !== to) {
        changes.push({
          field: 'attendees',
          label: 'Attendees',
          from: `${attendees.length} (${from})`,
          to: `${nowAttended.length} (${to})`,
        });
      } else if (who(attendees) !== who(dto.attendees)) {
        // Names corrected: personal details, so only that they changed.
        changes.push({
          field: 'attendees',
          label: 'Attendees',
          from: null,
          to: null,
          hidden: true,
        });
      }
      if (changes.length === 0) return this.one(tx, id);
      audit(tx, actorOf(user), {
        action: 'training.updated',
        entityType: 'training',
        entityId: id,
        assetId: dto.deviceIds.length === 1 ? dto.deviceIds[0] : null,
        summary: `Corrected the training on ${dto.equipment}: ${dto.topic}`,
        changes,
      });
      return this.one(tx, id);
    });
  }

  /** The date is not in the future; returns it. */
  private check(dto: TrainingInputDto): Date {
    const heldOn = localDay(dto.heldOn);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (heldOn > today) {
      throw new BadRequestException('The training date is in the future');
    }
    return heldOn;
  }

  private details(dto: TrainingInputDto, heldOn: Date) {
    return {
      heldOn,
      kind: dto.kind,
      topic: dto.topic,
      equipment: dto.equipment,
      trainer: dto.trainer,
      trainerFrom: dto.trainerFrom || null,
      durationHours: dto.durationHours ?? null,
      notes: dto.notes || null,
    };
  }

  /** The devices belong to this hospital; returns their tags, sorted. */
  private async devicesFound(tx: Tx, ids: string[], user: AuthUser) {
    if (ids.length === 0) return [];
    const found = await tx.asset.findMany({
      where: {
        id: { in: ids },
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: { assetTagNumber: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException(
        'Some of the chosen devices were not found. Reload and choose again.',
      );
    }
    return found.map((d) => d.assetTagNumber).sort();
  }

  private async replaceParts(tx: Tx, sessionId: string, dto: TrainingInputDto) {
    await tx.trainingSessionDevice.deleteMany({ where: { sessionId } });
    await tx.trainingAttendee.deleteMany({ where: { sessionId } });
    if (dto.deviceIds.length) {
      await tx.trainingSessionDevice.createMany({
        data: dto.deviceIds.map((assetId) => ({ sessionId, assetId })),
      });
    }
    await tx.trainingAttendee.createMany({
      data: dto.attendees.map((a) => ({
        sessionId,
        name: a.name,
        designation: a.designation || null,
        department: a.department || null,
        assessment: a.assessment ?? 'NOT_ASSESSED',
      })),
    });
  }

  private async one(tx: Tx, id: string) {
    const row = await tx.trainingSession.findFirst({
      where: { id },
      select: SELECT,
    });
    const files = await tx.document.count({
      where: { trainingSessionId: id, withdrawal: { is: null } },
    });
    return present(row!, files);
  }
}
