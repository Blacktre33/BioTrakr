import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Asset, AssetScanLog } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { CreateAssetScanDto } from './dto/create-asset-scan.dto';
import { CreateAssetDto, UpdateAssetDto } from './dto/create-asset.dto';

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

    const data: Prisma.AssetUncheckedCreateInput = {
      ...baseDto,
      notes: finalNotes || undefined,
      // Ownership and audit fields always come from the caller's token.
      organizationId: user.organizationId,
      createdById: user.userId,
      updatedById: user.userId,
    };

    return this.prisma.asset.create({ data });
  }

  async findAll(
    user: AuthUser,
    params: { skip?: number; take?: number } = {},
  ): Promise<Asset[]> {
    return this.prisma.asset.findMany({
      skip: params.skip ?? 0,
      take: Math.min(params.take ?? 20, MAX_PAGE_SIZE),
      where: { organizationId: user.organizationId },
      orderBy: { assetTagNumber: 'asc' },
      include: {
        currentFacility: true,
        currentRoom: true,
      },
    });
  }

  async findOne(id: string, user: AuthUser): Promise<Asset | null> {
    return this.prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId },
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
    await this.getOwnedAssetOrThrow(id, user);
    await this.assertReferencesInOrganization(user.organizationId, {
      facilityId: updateAssetDto.currentFacilityId,
      roomId: updateAssetDto.currentRoomId,
    });

    return this.prisma.asset.update({
      where: { id },
      data: {
        ...updateAssetDto,
        updatedById: user.userId,
      },
    });
  }

  async remove(id: string, user: AuthUser): Promise<Asset> {
    await this.getOwnedAssetOrThrow(id, user);
    return this.prisma.asset.delete({ where: { id } });
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

  /** 404s for assets that don't exist *or* belong to another organization. */
  private async getOwnedAssetOrThrow(
    id: string,
    user: AuthUser,
  ): Promise<{ id: string }> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }
    return asset;
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
