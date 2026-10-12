import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { documentCounts } from '../documents/documents.service';
import { earlierCover } from './earlier-cover';
import {
  contractStatus,
  daysUntil,
  endOfDay,
  ENDING_SOON_DAYS,
  formatDate,
  startOfDay,
} from './contract-status';
import type {
  ContractFilter,
  ContractInputDto,
  ListContractsQuery,
  TerminateContractDto,
} from './contracts.dto';
import { VENDOR_SELECT } from './vendors.service';

type Tx = Prisma.TransactionClient;

/** Ten years and a few leap days. */
const MAX_PERIOD_DAYS = 10 * 366;
/** How far back a contract's renewal history is followed. */
const HISTORY_DEPTH = 20;

export const DEVICE_SELECT = {
  id: true,
  assetTagNumber: true,
  equipmentName: true,
  assetStatus: true,
} satisfies Prisma.AssetSelect;

const CONTRACT_SELECT = {
  id: true,
  contractType: true,
  contractNumber: true,
  startDate: true,
  endDate: true,
  annualValue: true,
  pmVisitsPerYear: true,
  responseTimeHours: true,
  uptimeGuaranteePercent: true,
  notes: true,
  renewsId: true,
  terminatedAt: true,
  terminationReason: true,
  createdAt: true,
  updatedAt: true,
  vendor: { select: VENDOR_SELECT },
  renews: { select: { id: true, contractNumber: true, annualValue: true } },
  renewedBy: { select: { id: true } },
  devices: { select: { asset: { select: DEVICE_SELECT } } },
} satisfies Prisma.ServiceContractSelect;

type Row = Prisma.ServiceContractGetPayload<{ select: typeof CONTRACT_SELECT }>;

/** Money and percentages leave the API as plain numbers. */
const num = (v: Prisma.Decimal | number | null | undefined) =>
  v === null || v === undefined ? null : Number(v);

function present(
  { renews, renewedBy, devices, ...row }: Row,
  now: Date,
  documents = 0,
) {
  return {
    ...row,
    /** Files attached (not withdrawn), e.g. the signed contract. */
    documents,
    annualValue: num(row.annualValue),
    uptimeGuaranteePercent: num(row.uptimeGuaranteePercent),
    devices: devices
      .map((d) => d.asset)
      .sort((a, b) => a.assetTagNumber.localeCompare(b.assetTagNumber)),
    status: contractStatus(row, now),
    /** Days to the last day of cover: negative once it has passed. */
    daysLeft: daysUntil(row.endDate, now),
    /** The contract that renews this one, if any. */
    renewedById: renewedBy?.id ?? null,
    /** The contract this one renews, for the change in cost. */
    previous: renews
      ? { ...renews, annualValue: num(renews.annualValue) }
      : null,
  };
}

export type ContractView = ReturnType<typeof present>;

function matches(c: ContractView, filter: ContractFilter): boolean {
  switch (filter) {
    case 'current':
      return c.status === 'active' || c.status === 'upcoming';
    case 'ending':
      return (
        c.status === 'active' &&
        c.daysLeft <= ENDING_SOON_DAYS &&
        !c.renewedById
      );
    case 'expired':
      return c.status === 'expired';
    case 'terminated':
      return c.status === 'terminated';
    default:
      return true;
  }
}

const TYPE_LABEL = { AMC: 'AMC', CMC: 'CMC' } as const;

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The hospital's contracts, soonest ending first. */
  async list(user: AuthUser, query: ListContractsQuery = {}) {
    const rows = await this.prisma.serviceContract.findMany({
      where: {
        organizationId: user.organizationId,
        ...(query.vendorId ? { vendorId: query.vendorId } : {}),
      },
      orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
      take: 2000,
      select: CONTRACT_SELECT,
    });
    const now = new Date();
    const files = await documentCounts(
      this.prisma,
      'contractId',
      rows.map((r) => r.id),
    );
    return rows
      .map((r) => present(r, now, files.get(r.id)))
      .filter((c) => matches(c, query.status ?? 'current'));
  }

  /** One contract, with what each earlier year cost. */
  async get(id: string, user: AuthUser) {
    const row = await this.prisma.serviceContract.findFirst({
      where: { id, organizationId: user.organizationId },
      select: CONTRACT_SELECT,
    });
    if (!row) throw new NotFoundException('Contract not found');

    const history: Array<{
      id: string;
      contractNumber: string;
      startDate: Date;
      endDate: Date;
      annualValue: number | null;
    }> = [];
    let previousId = row.renewsId;
    for (let i = 0; previousId && i < HISTORY_DEPTH; i++) {
      const p = await this.prisma.serviceContract.findFirst({
        where: { id: previousId, organizationId: user.organizationId },
        select: {
          id: true,
          contractNumber: true,
          startDate: true,
          endDate: true,
          annualValue: true,
          renewsId: true,
        },
      });
      if (!p) break;
      const { renewsId, ...earlier } = p;
      history.push({ ...earlier, annualValue: num(earlier.annualValue) });
      previousId = renewsId;
    }
    const files = await documentCounts(this.prisma, 'contractId', [row.id]);
    return { ...present(row, new Date(), files.get(row.id)), history };
  }

  /** A device's warranty and every contract that has covered it, newest first. */
  async coverForAsset(assetId: string, user: AuthUser) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: {
        warrantyStartDate: true,
        warrantyEndDate: true,
        warrantyTerms: true,
        // Typed on the device before contracts had their own records.
        amcContractNumber: true,
        amcStartDate: true,
        amcEndDate: true,
        amcCostAnnual: true,
        amcProvider: { select: { id: true, vendorName: true } },
        cmcProvider: { select: { id: true, vendorName: true } },
        notes: true,
      },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);
    const rows = await this.prisma.serviceContract.findMany({
      where: {
        organizationId: user.organizationId,
        devices: { some: { assetId } },
      },
      orderBy: [{ endDate: 'desc' }, { id: 'asc' }],
      take: 50,
      select: CONTRACT_SELECT,
    });
    const now = new Date();
    const files = await documentCounts(
      this.prisma,
      'contractId',
      rows.map((r) => r.id),
    );
    const daysLeft = asset.warrantyEndDate
      ? daysUntil(asset.warrantyEndDate, now)
      : null;
    return {
      warranty: {
        startDate: asset.warrantyStartDate,
        endDate: asset.warrantyEndDate,
        terms: asset.warrantyTerms,
        daysLeft,
        active: daysLeft !== null && daysLeft >= 0,
      },
      contracts: rows.map((r) => present(r, now, files.get(r.id))),
      /** AMC/CMC details typed on the device, not yet entered as contracts. */
      earlier: earlierCover(asset, rows),
    };
  }

  async create(dto: ContractInputDto, user: AuthUser) {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.check(tx, dto, user);
      return this.insert(tx, dto, user);
    });
    return this.get(id, user);
  }

  /** Replaces a contract's details and devices. */
  async update(id: string, dto: ContractInputDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.find(tx, id, user);
      if (current.terminatedAt) {
        throw new ConflictException(
          'This contract was ended early and can no longer be changed',
        );
      }
      await this.check(tx, dto, user, id);
      await tx.serviceContract.updateMany({
        where: { id, organizationId: user.organizationId },
        data: { ...this.fields(dto), updatedById: user.userId },
      });
      await tx.serviceContractAsset.deleteMany({
        where: { contractId: id, assetId: { notIn: dto.deviceIds } },
      });
      await tx.serviceContractAsset.createMany({
        data: dto.deviceIds.map((assetId) => ({ contractId: id, assetId })),
        skipDuplicates: true,
      });
    });
    return this.get(id, user);
  }

  /** The next period: a new contract naming this one, so its cost is kept. */
  async renew(id: string, dto: ContractInputDto, user: AuthUser) {
    let created: string;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const current = await this.find(tx, id, user);
        if (current.renewedBy) {
          throw new ConflictException(
            'This contract has already been renewed. Open the renewal instead.',
          );
        }
        if (current.terminatedAt) {
          throw new ConflictException(
            'This contract was ended early. Add a new contract instead.',
          );
        }
        if (daysUntil(new Date(dto.startDate), current.startDate) <= 0) {
          throw new BadRequestException([
            'A renewal must start after the contract it renews',
          ]);
        }
        await this.check(tx, dto, user);
        return this.insert(tx, dto, user, id);
      });
    } catch (error) {
      // The unique renewsId: someone renewed it just now.
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          'This contract has already been renewed. Reload to see the renewal.',
        );
      }
      throw error;
    }
    return this.get(created, user);
  }

  /** Ends a contract early. It stays on record with the reason. */
  async terminate(id: string, dto: TerminateContractDto, user: AuthUser) {
    const current = await this.find(this.prisma, id, user);
    const status = contractStatus(current);
    if (status === 'terminated' || status === 'expired') {
      throw new ConflictException('This contract has already ended');
    }
    const { count } = await this.prisma.serviceContract.updateMany({
      where: { id, organizationId: user.organizationId, terminatedAt: null },
      data: {
        terminatedAt: new Date(),
        terminationReason: dto.reason,
        updatedById: user.userId,
      },
    });
    if (count === 0) {
      throw new ConflictException('This contract has already ended');
    }
    return this.get(id, user);
  }

  private async find(
    db: Pick<Tx, 'serviceContract'>,
    id: string,
    user: AuthUser,
  ) {
    const row = await db.serviceContract.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        terminatedAt: true,
        renewedBy: { select: { id: true } },
      },
    });
    if (!row) throw new NotFoundException('Contract not found');
    return row;
  }

  private fields(dto: ContractInputDto) {
    return {
      vendorId: dto.vendorId,
      contractType: dto.contractType,
      contractNumber: dto.contractNumber,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      annualValue: dto.annualValue ?? null,
      pmVisitsPerYear: dto.pmVisitsPerYear ?? null,
      responseTimeHours: dto.responseTimeHours ?? null,
      uptimeGuaranteePercent: dto.uptimeGuaranteePercent ?? null,
      notes: dto.notes?.trim() || null,
    };
  }

  private async insert(
    tx: Tx,
    dto: ContractInputDto,
    user: AuthUser,
    renewsId?: string,
  ): Promise<string> {
    const { id } = await tx.serviceContract.create({
      data: {
        ...this.fields(dto),
        organizationId: user.organizationId,
        renewsId: renewsId ?? null,
        createdById: user.userId,
        updatedById: user.userId,
      },
      select: { id: true },
    });
    await tx.serviceContractAsset.createMany({
      data: dto.deviceIds.map((assetId) => ({ contractId: id, assetId })),
    });
    return id;
  }

  /**
   * The vendor and devices belong to this hospital, the period makes sense,
   * and no device is covered twice at once: one contract answers "who do
   * we call?" for any day.
   */
  private async check(
    tx: Tx,
    dto: ContractInputDto,
    user: AuthUser,
    exceptId?: string,
  ) {
    const problems: string[] = [];
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    const length = daysUntil(end, start);
    if (length < 0) {
      problems.push('The end date must be on or after the start date');
    } else if (length > MAX_PERIOD_DAYS) {
      problems.push('A contract can run for at most 10 years');
    }

    const vendor = await tx.vendor.findFirst({
      where: { id: dto.vendorId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!vendor) problems.push('Choose a vendor from the list');

    const devices = await tx.asset.findMany({
      where: {
        id: { in: dto.deviceIds },
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: DEVICE_SELECT,
    });
    if (devices.length !== new Set(dto.deviceIds).size) {
      problems.push(
        'Some of the chosen devices were not found. Reload and choose again.',
      );
    }
    if (problems.length) throw new BadRequestException(problems);

    const byId = new Map(devices.map((d) => [d.id, d]));
    const clashes = await tx.serviceContractAsset.findMany({
      where: {
        assetId: { in: dto.deviceIds },
        contract: {
          organizationId: user.organizationId,
          terminatedAt: null,
          ...(exceptId ? { id: { not: exceptId } } : {}),
          startDate: { lte: endOfDay(end) },
          endDate: { gte: startOfDay(start) },
        },
      },
      select: {
        assetId: true,
        contract: {
          select: {
            contractType: true,
            contractNumber: true,
            startDate: true,
            endDate: true,
            vendor: { select: { vendorName: true } },
          },
        },
      },
    });
    for (const { assetId, contract: c } of clashes) {
      const d = byId.get(assetId)!;
      problems.push(
        `${d.equipmentName} (${d.assetTagNumber}) is already covered by ${TYPE_LABEL[c.contractType]} ${c.contractNumber} (${c.vendor.vendorName}) from ${formatDate(c.startDate)} to ${formatDate(c.endDate)}`,
      );
    }
    if (problems.length) throw new BadRequestException(problems);
  }
}
