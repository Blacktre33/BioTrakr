import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Asset, AssetScanLog } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateAssetScanDto } from './dto/create-asset-scan.dto';
import { CreateAssetDto, UpdateAssetDto } from './dto/create-asset.dto';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  // Mock user ID for now
  private readonly MOCK_USER_ID = '00000000-0000-0000-0000-000000000000';

  async create(createAssetDto: CreateAssetDto): Promise<Asset> {
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
    } = createAssetDto as any;

    // Build contract tracking data to store in notes (for fields not in schema)
    const contractTracking: any = {};
    
    // AMC tracking fields (initial cost, years paid, increases) - not in schema
    if (amcInitialCost || amcYearsPaid || amcIncreaseAmount || amcIncreasePercentage) {
      contractTracking.amc = {};
      if (amcInitialCost) contractTracking.amc.initialCost = amcInitialCost;
      if (amcYearsPaid) contractTracking.amc.yearsPaid = amcYearsPaid;
      if (amcIncreaseAmount) contractTracking.amc.increaseAmount = amcIncreaseAmount;
      if (amcIncreasePercentage) contractTracking.amc.increasePercentage = amcIncreasePercentage;
    }
    
    // All CMC data (schema only has cmcProviderId, no cost/date fields)
    if (cmcCostAnnual || cmcContractNumber || cmcStartDate || cmcEndDate || cmcInitialCost || cmcYearsPaid || cmcIncreaseAmount || cmcIncreasePercentage) {
      contractTracking.cmc = {};
      if (cmcCostAnnual) contractTracking.cmc.costAnnual = cmcCostAnnual;
      if (cmcContractNumber) contractTracking.cmc.contractNumber = cmcContractNumber;
      if (cmcStartDate) contractTracking.cmc.startDate = cmcStartDate;
      if (cmcEndDate) contractTracking.cmc.endDate = cmcEndDate;
      if (cmcInitialCost) contractTracking.cmc.initialCost = cmcInitialCost;
      if (cmcYearsPaid) contractTracking.cmc.yearsPaid = cmcYearsPaid;
      if (cmcIncreaseAmount) contractTracking.cmc.increaseAmount = cmcIncreaseAmount;
      if (cmcIncreasePercentage) contractTracking.cmc.increasePercentage = cmcIncreasePercentage;
    }

    // Combine notes with contract tracking data
    let finalNotes = notes || '';
    if (Object.keys(contractTracking).length > 0) {
      const trackingJson = JSON.stringify(contractTracking, null, 2);
      finalNotes = finalNotes 
        ? `${finalNotes}\n\n[CONTRACT_TRACKING]\n${trackingJson}`
        : `[CONTRACT_TRACKING]\n${trackingJson}`;
    }

    // We use UncheckedCreateInput implicitly by spreading the DTO which contains foreign key IDs
    // instead of relation objects.
    // Note: amcCostAnnual, amcContractNumber, amcStartDate, amcEndDate are stored in schema fields
    // All tracking data (initial cost, years paid, increases) and CMC data stored in notes
    const data: Prisma.AssetUncheckedCreateInput = {
      ...baseDto,
      notes: finalNotes || undefined,
      createdById: this.MOCK_USER_ID,
      updatedById: this.MOCK_USER_ID,
    };

    return this.prisma.asset.create({
      data: data as unknown as Prisma.AssetCreateInput, // Cast needed due to Prisma XOR types
    });
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.AssetWhereUniqueInput;
    where?: Prisma.AssetWhereInput;
    orderBy?: Prisma.AssetOrderByWithRelationInput;
  }): Promise<Asset[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.asset.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
      include: {
        currentFacility: true,
        currentRoom: true,
      },
    });
  }

  async findOne(id: string): Promise<Asset | null> {
    return this.prisma.asset.findUnique({
      where: { id },
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

  async update(id: string, updateAssetDto: UpdateAssetDto): Promise<Asset> {
    try {
      return await this.prisma.asset.update({
        where: { id },
        data: {
          ...updateAssetDto,
          updatedById: this.MOCK_USER_ID,
        },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Asset #${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<Asset> {
    try {
      return await this.prisma.asset.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Asset #${id} not found`);
      }
      throw error;
    }
  }

  async createAssetScan(
    assetId: string,
    payload: CreateAssetScanDto,
  ): Promise<AssetScanLog> {
    // Fail fast if the asset ID is invalid; avoids orphaning scan rows and returns a clean 404.
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} does not exist.`);
    }

    const data: Prisma.AssetScanLogCreateInput = {
      asset: { connect: { id: assetId } },
      qrPayload: payload.qrPayload,
      notes: payload.notes ?? null,
      locationHint: payload.locationHint ?? null,
    };

    // Persist the scan log with a relational connect instead of writing the FK manually.
    return this.prisma.assetScanLog.create({ data });
  }

  async listAssetScans(assetId: string): Promise<AssetScanLog[]> {
    // Re-run the lightweight existence check so consumers get a 404 instead of an empty list for bad IDs.
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} does not exist.`);
    }

    // Return newest-first so the UI can render the freshest scan at the top.
    return this.prisma.assetScanLog.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
