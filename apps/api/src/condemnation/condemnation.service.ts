import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { changeAssetStatus } from '../assets/asset-status.service';
import { actorOf, audit, auditedTransaction, type Actor } from '../audit/audit';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { documentCounts } from '../documents/documents.service';
import {
  bestEffort,
  deviceForNotice,
  deviceLabel,
  notify,
} from '../notifications/notify';
import { OPEN_STATUSES } from '../work-orders/work-orders.service';
import {
  ageYears,
  bookValue,
  CLEARANCE_TEXT,
  clearanceFor,
  clearanceNeeded,
  DISPOSAL_LABEL,
  OPEN_CONDEMNATION,
  reasonsText,
  repairShare,
  type CondemnationEvidence,
} from './condemnation';
import type {
  DecideCondemnationDto,
  DisposeCondemnationDto,
  ProposeCondemnationDto,
  WithdrawCondemnationDto,
} from './condemnation.dto';

type Tx = Prisma.TransactionClient;

const DAY = 24 * 60 * 60 * 1000;
const BREAKDOWNS = ['CORRECTIVE_MAINTENANCE', 'EMERGENCY_REPAIR'] as const;

const PERSON = { select: { firstName: true, lastName: true } } as const;
const name = (u: { firstName: string; lastName: string } | null) =>
  u ? `${u.firstName} ${u.lastName}`.trim() : null;
const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

const SELECT = {
  id: true,
  assetId: true,
  status: true,
  reasons: true,
  justification: true,
  repairEstimate: true,
  currentValue: true,
  evidence: true,
  proposedById: true,
  proposedAt: true,
  proposedBy: PERSON,
  decidedAt: true,
  decidedBy: PERSON,
  committee: true,
  decisionNote: true,
  withdrawnAt: true,
  withdrawnBy: PERSON,
  withdrawalReason: true,
  disposedAt: true,
  disposedBy: PERSON,
  disposalMethod: true,
  disposalNote: true,
  clearance: true,
} satisfies Prisma.CondemnationSelect;

type Row = Prisma.CondemnationGetPayload<{ select: typeof SELECT }>;

const ASSET_SELECT = {
  id: true,
  assetTagNumber: true,
  equipmentName: true,
  assetStatus: true,
  purchaseDate: true,
  purchaseCost: true,
  salvageValue: true,
  usefulLifeYears: true,
} satisfies Prisma.AssetSelect;

type Device = Prisma.AssetGetPayload<{ select: typeof ASSET_SELECT }>;

function present(row: Row, files: number) {
  const repairEstimate = num(row.repairEstimate);
  const currentValue = num(row.currentValue);
  const evidence = row.evidence as unknown as CondemnationEvidence;
  return {
    id: row.id,
    assetId: row.assetId,
    status: row.status,
    reasons: row.reasons,
    justification: row.justification,
    repairEstimate,
    currentValue,
    /** Against the value given, or the book value when none was. */
    repairShare: repairShare(
      repairEstimate,
      currentValue ?? evidence.bookValue,
    ),
    evidence,
    proposedById: row.proposedById,
    proposedBy: name(row.proposedBy),
    proposedAt: row.proposedAt,
    decidedBy: name(row.decidedBy),
    decidedAt: row.decidedAt,
    committee: row.committee,
    decisionNote: row.decisionNote,
    withdrawnBy: name(row.withdrawnBy),
    withdrawnAt: row.withdrawnAt,
    withdrawalReason: row.withdrawalReason,
    disposedBy: name(row.disposedBy),
    disposedAt: row.disposedAt,
    disposalMethod: row.disposalMethod,
    disposalNote: row.disposalNote,
    clearance: row.clearance,
    files,
  };
}

/** "2026-10-20" is that day here. */
function localDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
}

/**
 * The condemnation file (NABH FMS.5.f; NHSRC guidelines): biomed proposes
 * a device for condemnation with the evidence, the committee's decision is
 * recorded by an administrator who did not propose it, and the disposal is
 * recorded with the recycler's certificate and any AERB or PC-PNDT
 * clearance. The device is condemned only once the proposal is approved.
 */
@Injectable()
export class CondemnationService {
  constructor(private readonly prisma: PrismaService) {}

  /** A device's proposals, newest first, and what its record says now. */
  async forAsset(assetId: string, user: AuthUser) {
    const device = await this.device(this.prisma, assetId, user);
    const now = new Date();
    const [evidence, rows] = await Promise.all([
      this.evidence(this.prisma, device, now),
      this.prisma.condemnation.findMany({
        where: { assetId, organizationId: user.organizationId },
        orderBy: [{ proposedAt: 'desc' }, { id: 'asc' }],
        select: SELECT,
      }),
    ]);
    const files = await documentCounts(
      this.prisma,
      'condemnationId',
      rows.map((r) => r.id),
    );
    const clearance = clearanceFor(device.equipmentName);
    return {
      evidence,
      clearance: clearance && {
        kind: clearance,
        text: CLEARANCE_TEXT[clearance],
      },
      condemnations: rows.map((r) => present(r, files.get(r.id) ?? 0)),
    };
  }

  async propose(dto: ProposeCondemnationDto, user: AuthUser) {
    const actor = actorOf(user);
    return auditedTransaction(this.prisma, async (tx) => {
      // One open proposal per device, even when two people propose at once.
      await tx.$queryRaw`SELECT id FROM "assets" WHERE id = ${dto.assetId} FOR UPDATE`;
      const device = await this.device(tx, dto.assetId, user);
      if (device.assetStatus === 'DISPOSED') {
        throw new BadRequestException('This device has been disposed of');
      }
      const open = await tx.condemnation.findFirst({
        where: { assetId: device.id, status: { in: OPEN_CONDEMNATION } },
        select: { status: true },
      });
      if (open) {
        throw new ConflictException(
          open.status === 'PROPOSED'
            ? 'This device is already waiting for the committee'
            : 'This device has been condemned: record its disposal',
        );
      }
      const evidence = await this.evidence(tx, device, new Date());
      const row = await tx.condemnation.create({
        data: {
          organizationId: user.organizationId,
          assetId: device.id,
          reasons: dto.reasons,
          justification: dto.justification,
          repairEstimate: dto.repairEstimate ?? null,
          currentValue: dto.currentValue ?? null,
          evidence: evidence as unknown as Prisma.InputJsonValue,
          proposedById: user.userId,
        },
        select: SELECT,
      });
      audit(tx, actor, {
        action: 'condemnation.proposed',
        entityType: 'condemnation',
        entityId: row.id,
        assetId: device.id,
        summary: `Proposed ${device.assetTagNumber} for condemnation: ${reasonsText(dto.reasons)}`,
        reason: dto.justification,
      });
      await this.tell(tx, actor, device.id, {
        title: `Proposed for condemnation: ${deviceLabel(device)}`,
        body: `${reasonsText(dto.reasons)}. The committee's decision is recorded on the device page.`,
        to: { roles: ['admin'] },
      });
      return present(row, 0);
    });
  }

  /** The committee's decision, recorded by an administrator. */
  async decide(id: string, dto: DecideCondemnationDto, user: AuthUser) {
    const note = dto.note?.trim() || null;
    if (dto.decision === 'REJECTED' && !note) {
      throw new BadRequestException("Say why the committee didn't approve it");
    }
    const actor = actorOf(user);
    return auditedTransaction(this.prisma, async (tx) => {
      const c = await this.find(tx, id, user);
      if (c.status !== 'PROPOSED') {
        throw new ConflictException('The committee has already decided');
      }
      if (c.proposedById === user.userId) {
        throw new ForbiddenException(
          "Someone other than whoever proposed it records the committee's decision",
        );
      }
      await this.move(tx, id, 'PROPOSED', {
        status: dto.decision,
        decidedById: user.userId,
        decidedAt: new Date(),
        committee: dto.committee,
        decisionNote: note,
      });
      const tag = c.asset.assetTagNumber;
      const approved = dto.decision === 'APPROVED';
      audit(tx, actor, {
        action: approved ? 'condemnation.approved' : 'condemnation.rejected',
        entityType: 'condemnation',
        entityId: id,
        assetId: c.assetId,
        summary: approved
          ? `The committee approved condemning ${tag} (${dto.committee})`
          : `The committee did not approve condemning ${tag} (${dto.committee})`,
        reason: note,
      });
      if (approved) {
        await changeAssetStatus(tx, {
          assetId: c.assetId,
          actor,
          toStatus: 'CONDEMNED',
          reason: `Condemned by the committee (${dto.committee})`,
          source: 'MANUAL',
        });
        await this.cancelOpenWork(tx, actor, c.assetId);
      }
      await this.tell(tx, actor, c.assetId, {
        title: `${approved ? 'Condemnation approved' : 'Condemnation not approved'}: ${deviceLabel(c.asset)}`,
        body: [dto.committee, note].filter(Boolean).join('\n'),
        to: { userIds: [c.proposedById] },
      });
      return this.one(tx, id);
    });
  }

  /**
   * A proposal is withdrawn by whoever made it, or an administrator; an
   * approved one only by an administrator, which puts the device out of
   * use until biomed checks it and releases it.
   */
  async withdraw(id: string, dto: WithdrawCondemnationDto, user: AuthUser) {
    const actor = actorOf(user);
    return auditedTransaction(this.prisma, async (tx) => {
      const c = await this.find(tx, id, user);
      const admin = user.role === 'admin';
      if (c.status === 'PROPOSED') {
        if (!admin && c.proposedById !== user.userId) {
          throw new ForbiddenException(
            'Only whoever proposed it, or an administrator, can withdraw it',
          );
        }
      } else if (c.status === 'APPROVED') {
        if (!admin) {
          throw new ForbiddenException(
            "Only an administrator can reverse the committee's approval",
          );
        }
      } else {
        throw new ConflictException(
          'Only a proposal, or a condemnation not yet disposed of, can be withdrawn',
        );
      }
      await this.move(tx, id, c.status, {
        status: 'WITHDRAWN',
        withdrawnById: user.userId,
        withdrawnAt: new Date(),
        withdrawalReason: dto.reason,
      });
      audit(tx, actor, {
        action: 'condemnation.withdrawn',
        entityType: 'condemnation',
        entityId: id,
        assetId: c.assetId,
        summary:
          c.status === 'APPROVED'
            ? `Reversed the condemnation of ${c.asset.assetTagNumber}`
            : `Withdrew the condemnation proposal for ${c.asset.assetTagNumber}`,
        reason: dto.reason,
      });
      if (c.status === 'APPROVED' && c.asset.assetStatus === 'CONDEMNED') {
        await changeAssetStatus(tx, {
          assetId: c.assetId,
          actor,
          toStatus: 'QUARANTINED',
          reason: `Condemnation reversed: ${dto.reason}`.slice(0, 1000),
          source: 'MANUAL',
        });
      }
      return this.one(tx, id);
    });
  }

  /** The device leaves the hospital. */
  async dispose(id: string, dto: DisposeCondemnationDto, user: AuthUser) {
    const disposedAt = localDay(dto.disposedOn);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (disposedAt > today) {
      throw new BadRequestException('The disposal date is in the future');
    }
    const actor = actorOf(user);
    return auditedTransaction(this.prisma, async (tx) => {
      const c = await this.find(tx, id, user);
      if (c.status !== 'APPROVED') {
        throw new ConflictException(
          c.status === 'PROPOSED'
            ? 'The committee has not approved it yet'
            : c.status === 'DISPOSED'
              ? 'Its disposal is already recorded'
              : 'It was not condemned',
        );
      }
      const decided = new Date(c.decidedAt!);
      decided.setHours(0, 0, 0, 0);
      if (disposedAt < decided) {
        throw new BadRequestException(
          "The disposal date is before the committee's decision",
        );
      }
      const clearance = clearanceFor(c.asset.equipmentName);
      const given = dto.clearance?.trim() || null;
      if (
        clearanceNeeded(clearance, dto.method) &&
        (!given || given.length < 5)
      ) {
        throw new BadRequestException(
          `${CLEARANCE_TEXT[clearance!]} Give its reference and date.`,
        );
      }
      await this.move(tx, id, 'APPROVED', {
        status: 'DISPOSED',
        disposedById: user.userId,
        disposedAt,
        disposalMethod: dto.method,
        disposalNote: dto.note,
        clearance: given,
      });
      audit(tx, actor, {
        action: 'condemnation.disposed',
        entityType: 'condemnation',
        entityId: id,
        assetId: c.assetId,
        summary: `Disposed of ${c.asset.assetTagNumber}: ${DISPOSAL_LABEL[dto.method]}`,
        reason: dto.note,
      });
      await changeAssetStatus(tx, {
        assetId: c.assetId,
        actor,
        toStatus: 'DISPOSED',
        reason: `Disposed of: ${DISPOSAL_LABEL[dto.method]}. ${dto.note}`.slice(
          0,
          1000,
        ),
        source: 'MANUAL',
      });
      return this.one(tx, id);
    });
  }

  private async device(
    db: Tx | PrismaService,
    assetId: string,
    user: AuthUser,
  ): Promise<Device> {
    const device = await db.asset.findFirst({
      where: {
        id: assetId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: ASSET_SELECT,
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  private async evidence(
    db: Tx | PrismaService,
    device: Device,
    now: Date,
  ): Promise<CondemnationEvidence> {
    const breakdowns = await db.maintenanceHistory.findMany({
      where: {
        assetId: device.id,
        workOrderType: { in: [...BREAKDOWNS] },
        workOrderStatus: { not: 'CANCELLED' },
        createdAt: { gte: new Date(now.getTime() - 365 * DAY) },
      },
      select: { createdAt: true, completedAt: true },
    });
    const hours = breakdowns.reduce(
      (sum, b) =>
        sum +
        ((b.completedAt ?? now).getTime() - b.createdAt.getTime()) / 3.6e6,
      0,
    );
    const purchaseCost = Number(device.purchaseCost);
    return {
      ageYears: ageYears(device.purchaseDate, now),
      usefulLifeYears: device.usefulLifeYears,
      purchaseCost,
      bookValue: bookValue(
        {
          purchaseCost,
          salvageValue: Number(device.salvageValue),
          usefulLifeYears: device.usefulLifeYears,
          purchaseDate: device.purchaseDate,
        },
        now,
      ),
      breakdowns: breakdowns.length,
      downtimeHours: Math.round(hours),
    };
  }

  private async find(tx: Tx, id: string, user: AuthUser) {
    const c = await tx.condemnation.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true,
        assetId: true,
        status: true,
        proposedById: true,
        decidedAt: true,
        asset: {
          select: {
            assetTagNumber: true,
            equipmentName: true,
            assetStatus: true,
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Condemnation not found');
    return c;
  }

  /** Changes the status only if nobody else has just changed it. */
  private async move(
    tx: Tx,
    id: string,
    from: Row['status'],
    data: Prisma.CondemnationUncheckedUpdateManyInput,
  ) {
    const { count } = await tx.condemnation.updateMany({
      where: { id, status: from },
      data,
    });
    if (count === 0) {
      throw new ConflictException(
        'Someone else changed this just now. Reload and check before trying again.',
      );
    }
  }

  private async one(tx: Tx, id: string) {
    const row = await tx.condemnation.findFirst({
      where: { id },
      select: SELECT,
    });
    const files = await tx.document.count({
      where: { condemnationId: id, withdrawal: { is: null } },
    });
    return present(row!, files);
  }

  /** A condemned device is not repaired or maintained any more. */
  private async cancelOpenWork(tx: Tx, actor: Actor, assetId: string) {
    const open = await tx.maintenanceHistory.findMany({
      where: { assetId, workOrderStatus: { in: OPEN_STATUSES } },
      select: { id: true, workOrderStatus: true, description: true },
    });
    for (const wo of open) {
      const { count } = await tx.maintenanceHistory.updateMany({
        where: { id: wo.id, workOrderStatus: wo.workOrderStatus },
        data: {
          workOrderStatus: 'CANCELLED',
          workPerformed: 'Cancelled: the device was condemned',
        },
      });
      if (count === 0) continue;
      audit(tx, actor, {
        action: 'work_order.cancelled',
        entityType: 'work_order',
        entityId: wo.id,
        assetId,
        summary: `Work order cancelled: ${wo.description?.split('\n')[0] ?? 'open work'}`,
        reason: 'The device was condemned',
      });
    }
  }

  private async tell(
    tx: Tx,
    actor: Actor,
    assetId: string,
    n: {
      title: string;
      body: string;
      to: { userIds: string[] } | { roles: ['admin'] };
    },
  ) {
    await bestEffort(tx, 'condemnation notice', async () => {
      const d = await deviceForNotice(tx, assetId, actor.organizationId);
      if (!d) return;
      await notify(tx, {
        organizationId: actor.organizationId,
        kind: 'condemnation',
        severity: 'info',
        title: n.title,
        body: n.body,
        link: `/assets/${assetId}`,
        assetId,
        to:
          'roles' in n.to
            ? { roles: n.to.roles, facilityId: d.currentFacilityId }
            : n.to,
        excludeUserId: actor.userId,
      });
    });
  }
}
