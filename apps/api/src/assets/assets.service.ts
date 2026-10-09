import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Asset, AssetScanLog } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { CreateAssetScanDto } from './dto/create-asset-scan.dto';
import { CreateAssetDto, UpdateAssetDto } from './dto/create-asset.dto';
import type { AssetSort, ListAssetsQuery } from './dto/list-assets.query';
import { nextPmDue } from './pm-dates';

export const MAX_PAGE_SIZE = 100;

interface OrgReferences {
  facilityId?: string | null;
  departmentId?: string | null;
  custodianId?: string | null;
  roomId?: string | null;
}

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAssetDto: CreateAssetDto, user: AuthUser): Promise<Asset> {
    // Extract AMC/CMC tracking fields that aren't in the schema
    const {
      amcInitialCost,
      amcYearsPaid,
      amcIncreaseAmount,
      amcIncreasePercentage,
      cmcCostAnnual,
      cmcContractNumber,
      cmcStartDate,
      cmcEndDate,
      cmcInitialCost,
      cmcYearsPaid,
      cmcIncreaseAmount,
      cmcIncreasePercentage,
      notes,
      ...baseDto
    } = createAssetDto;

    await this.assertReferencesInOrganization(user.organizationId, {
      facilityId: baseDto.currentFacilityId,
      departmentId: baseDto.custodianDepartmentId,
      custodianId: baseDto.primaryCustodianId,
    });
    await this.assertDepartmentInFacility(
      baseDto.custodianDepartmentId,
      baseDto.currentFacilityId,
    );

    // Tags are unique case-sensitively in the database, but staff type and
    // scan them in any case: "vent-7" next to "VENT-7" would make a scan
    // ambiguous. Same message as the unique-key conflict below.
    const clash = await this.prisma.asset.findFirst({
      where: {
        organizationId: user.organizationId,
        assetTagNumber: { equals: baseDto.assetTagNumber, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('This asset tag number is already in use');
    }

    // Build contract tracking data to store in notes (for fields not in schema)
    const contractTracking: Record<string, Record<string, unknown>> = {};

    if (
      amcInitialCost ||
      amcYearsPaid ||
      amcIncreaseAmount ||
      amcIncreasePercentage
    ) {
      contractTracking.amc = {};
      if (amcInitialCost) contractTracking.amc.initialCost = amcInitialCost;
      if (amcYearsPaid) contractTracking.amc.yearsPaid = amcYearsPaid;
      if (amcIncreaseAmount)
        contractTracking.amc.increaseAmount = amcIncreaseAmount;
      if (amcIncreasePercentage)
        contractTracking.amc.increasePercentage = amcIncreasePercentage;
    }

    // All CMC data (schema only has cmcProviderId, no cost/date fields)
    if (
      cmcCostAnnual ||
      cmcContractNumber ||
      cmcStartDate ||
      cmcEndDate ||
      cmcInitialCost ||
      cmcYearsPaid ||
      cmcIncreaseAmount ||
      cmcIncreasePercentage
    ) {
      contractTracking.cmc = {};
      if (cmcCostAnnual) contractTracking.cmc.costAnnual = cmcCostAnnual;
      if (cmcContractNumber)
        contractTracking.cmc.contractNumber = cmcContractNumber;
      if (cmcStartDate) contractTracking.cmc.startDate = cmcStartDate;
      if (cmcEndDate) contractTracking.cmc.endDate = cmcEndDate;
      if (cmcInitialCost) contractTracking.cmc.initialCost = cmcInitialCost;
      if (cmcYearsPaid) contractTracking.cmc.yearsPaid = cmcYearsPaid;
      if (cmcIncreaseAmount)
        contractTracking.cmc.increaseAmount = cmcIncreaseAmount;
      if (cmcIncreasePercentage)
        contractTracking.cmc.increasePercentage = cmcIncreasePercentage;
    }

    let finalNotes = notes || '';
    if (Object.keys(contractTracking).length > 0) {
      const trackingJson = JSON.stringify(contractTracking, null, 2);
      finalNotes = finalNotes
        ? `${finalNotes}\n\n[CONTRACT_TRACKING]\n${trackingJson}`
        : `[CONTRACT_TRACKING]\n${trackingJson}`;
    }

    const lastPmDate = baseDto.lastPmDate
      ? new Date(baseDto.lastPmDate)
      : undefined;
    if (lastPmDate && lastPmDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BadRequestException('The last PM date cannot be in the future');
    }
    const data: Prisma.AssetUncheckedCreateInput = {
      ...baseDto,
      lastPmDate,
      nextPmDueDate: nextPmDue(lastPmDate, baseDto.pmFrequencyDays, new Date()),
      notes: finalNotes || undefined,
      // Ownership and audit fields always come from the caller's token.
      organizationId: user.organizationId,
      createdById: user.userId,
      updatedById: user.userId,
    };

    try {
      return await this.prisma.asset.create({ data });
    } catch (error) {
      // Asset tags are unique within the organization (deleted assets keep
      // theirs, so their history stays unambiguous).
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('This asset tag number is already in use');
      }
      throw error;
    }
  }

  /** One page of the organization's devices, with the total for paging. */
  async findAll(user: AuthUser, query: ListAssetsQuery = {}) {
    const and: Prisma.AssetWhereInput[] = [];
    const search = query.search?.trim();
    if (search) {
      const contains = { contains: search, mode: 'insensitive' as const };
      and.push({
        OR: [
          { assetTagNumber: contains },
          { equipmentName: contains },
          { serialNumber: contains },
          { manufacturer: contains },
          { modelNumber: contains },
        ],
      });
    }
    if (query.status?.length) and.push({ assetStatus: { in: query.status } });
    if (query.category?.length)
      and.push({ deviceCategory: { in: query.category } });
    if (query.criticality?.length) {
      and.push({ criticalityLevel: { in: query.criticality } });
    }
    if (query.facilityId) and.push({ currentFacilityId: query.facilityId });
    if (query.departmentId)
      and.push({ custodianDepartmentId: query.departmentId });
    if (query.pmOverdue) and.push({ nextPmDueDate: { lt: new Date() } });

    const where: Prisma.AssetWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(and.length ? { AND: and } : {}),
    };

    const order = query.order ?? 'asc';
    const sortBy: Record<AssetSort, Prisma.AssetOrderByWithRelationInput> = {
      tag: { assetTagNumber: order },
      name: { equipmentName: order },
      status: { assetStatus: order },
      nextPm: { nextPmDueDate: { sort: order, nulls: 'last' } },
      updated: { updatedAt: order },
    };

    const [total, items] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        // id last, so paging is stable when the sort values tie.
        orderBy: [sortBy[query.sort ?? 'tag'], { id: 'asc' }],
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 25, MAX_PAGE_SIZE),
        include: {
          currentFacility: { select: { id: true, facilityName: true } },
          currentRoom: { select: { id: true, roomName: true, roomCode: true } },
          custodianDepartment: { select: { id: true, departmentName: true } },
        },
      }),
    ]);
    return { total, items };
  }

  async findOne(id: string, user: AuthUser): Promise<Asset | null> {
    return this.prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: {
        currentFacility: true,
        currentBuilding: true,
        currentFloor: true,
        currentRoom: true,
        custodianDepartment: true,
        vendor: true,
        maintenanceHistory: {
          take: 5,
          orderBy: { scheduledDate: 'desc' },
        },
        scanLogs: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async update(
    id: string,
    updateAssetDto: UpdateAssetDto,
    user: AuthUser,
  ): Promise<Asset> {
    await this.assertReferencesInOrganization(user.organizationId, {
      facilityId: updateAssetDto.currentFacilityId,
      roomId: updateAssetDto.currentRoomId,
      departmentId: updateAssetDto.custodianDepartmentId,
      custodianId: updateAssetDto.primaryCustodianId,
    });
    if (
      updateAssetDto.currentFacilityId ||
      updateAssetDto.custodianDepartmentId
    ) {
      const current = await this.prisma.asset.findFirst({
        where: { id, organizationId: user.organizationId, deletedAt: null },
        select: { currentFacilityId: true, custodianDepartmentId: true },
      });
      if (!current) throw new NotFoundException(`Asset ${id} not found`);
      await this.assertDepartmentInFacility(
        updateAssetDto.custodianDepartmentId ?? current.custodianDepartmentId,
        updateAssetDto.currentFacilityId ?? current.currentFacilityId,
      );
    }

    // A new PM interval reschedules the next PM from the last one.
    let pmSchedule: { nextPmDueDate: Date | null } | undefined;
    if (updateAssetDto.pmFrequencyDays !== undefined) {
      const current = await this.prisma.asset.findFirst({
        where: { id, organizationId: user.organizationId, deletedAt: null },
        select: { lastPmDate: true, createdAt: true },
      });
      if (!current) throw new NotFoundException(`Asset ${id} not found`);
      pmSchedule = {
        nextPmDueDate: nextPmDue(
          current.lastPmDate,
          updateAssetDto.pmFrequencyDays,
          current.createdAt,
        ),
      };
    }

    // One conditional write: cannot land on another organization's asset or
    // on one that was deleted in the meantime.
    const { count } = await this.prisma.asset.updateMany({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      data: { ...updateAssetDto, ...pmSchedule, updatedById: user.userId },
    });
    if (count === 0) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    return (await this.findOne(id, user))!;
  }

  /**
   * Soft delete: the asset disappears from the registry but the row and all of
   * its history are kept for audit. The asset tag stays reserved.
   */
  async remove(
    id: string,
    user: AuthUser,
  ): Promise<{ id: string; deletedAt: Date }> {
    const deletedAt = new Date();
    // Conditional on deletedAt: null, so a repeat delete is a 404 and never
    // overwrites who deleted it and when.
    const { count } = await this.prisma.asset.updateMany({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      data: { deletedAt, deletedById: user.userId, updatedById: user.userId },
    });
    if (count === 0) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    return { id, deletedAt };
  }

  async createAssetScan(
    assetId: string,
    payload: CreateAssetScanDto,
    user: AuthUser,
  ): Promise<AssetScanLog> {
    // Fail fast if the asset is unknown (or another organization's); returns a clean 404.
    await this.getOwnedAssetOrThrow(assetId, user);

    const data: Prisma.AssetScanLogCreateInput = {
      asset: { connect: { id: assetId } },
      qrPayload: payload.qrPayload,
      notes: payload.notes ?? null,
      locationHint: payload.locationHint ?? null,
      scannedBy: { connect: { id: user.userId } },
    };

    return this.prisma.assetScanLog.create({ data });
  }

  async listAssetScans(
    assetId: string,
    user: AuthUser,
  ): Promise<AssetScanLog[]> {
    await this.getOwnedAssetOrThrow(assetId, user);

    // Newest first so the UI can render the freshest scan at the top.
    return this.prisma.assetScanLog.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 404s for assets that don't exist, are soft-deleted, or belong to another organization. */
  private async getOwnedAssetOrThrow(
    id: string,
    user: AuthUser,
  ): Promise<{ id: string }> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    return asset;
  }

  /** A device's department must belong to the facility it is in. */
  private async assertDepartmentInFacility(
    departmentId: string,
    facilityId: string,
  ): Promise<void> {
    const matches = await this.prisma.department.count({
      where: { id: departmentId, facilityId },
    });
    if (matches === 0) {
      throw new BadRequestException({
        message: 'The department is not in the selected facility',
        fields: ['custodianDepartmentId'],
      });
    }
  }

  /** Rejects references to facilities, departments, rooms or users outside the caller's organization. */
  private async assertReferencesInOrganization(
    organizationId: string,
    refs: OrgReferences,
  ): Promise<void> {
    const checks: Array<[string, Promise<number>]> = [];

    if (refs.facilityId) {
      checks.push([
        'currentFacilityId',
        this.prisma.facility.count({
          where: { id: refs.facilityId, organizationId },
        }),
      ]);
    }
    if (refs.departmentId) {
      checks.push([
        'custodianDepartmentId',
        this.prisma.department.count({
          where: { id: refs.departmentId, facility: { organizationId } },
        }),
      ]);
    }
    if (refs.custodianId) {
      checks.push([
        'primaryCustodianId',
        this.prisma.user.count({
          where: { id: refs.custodianId, organizationId },
        }),
      ]);
    }
    if (refs.roomId) {
      checks.push([
        'currentRoomId',
        this.prisma.room.count({
          where: {
            id: refs.roomId,
            floor: { building: { facility: { organizationId } } },
          },
        }),
      ]);
    }

    const results = await Promise.all(checks.map(([, count]) => count));
    const missing = checks
      .filter((_, i) => results[i] === 0)
      .map(([field]) => field);
    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'Referenced records were not found in your organization',
        fields: missing,
      });
    }
  }
}
