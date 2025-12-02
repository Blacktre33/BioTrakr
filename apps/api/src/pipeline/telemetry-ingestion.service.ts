import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { loadPipelineConfig } from '@biotrakr/config';
import type {
  TelemetryIngestEvent as TelemetryIngestEventType,
  TelemetryIngestPayload,
} from '@biotrakr/types';

import { PrismaService } from '../database/prisma.service';

interface TelemetryIngestEventWithPayload extends TelemetryIngestEventType {
  payload: TelemetryIngestPayload;
}

@Injectable()
export class TelemetryIngestionService {
  private readonly logger = new Logger(TelemetryIngestionService.name);
  private readonly config = loadPipelineConfig();

  constructor(private readonly prisma: PrismaService) {}

  async processPendingBatch(
    batchSize = this.config.batchSize,
  ): Promise<number> {
    const pendingEvents = await this.prisma.telemetryIngestEvent.findMany({
      where: { status: 'pending' },
      take: batchSize,
      orderBy: { receivedAt: 'asc' },
    });

    if (!pendingEvents.length) {
      return 0;
    }

    const results = await Promise.all(
      pendingEvents.map((event) =>
        this.processSingleEvent(event as unknown as TelemetryIngestEventWithPayload),
      ),
    );

    return results.filter(Boolean).length;
  }

  private async processSingleEvent(
    event: TelemetryIngestEventWithPayload,
  ): Promise<boolean> {
    const { payload } = event;

    const asset = await this.resolveAsset(
      event.assetId,
      payload.assetId,
      payload.assetExternalId,
    );

    if (!asset) {
      await this.markEventFailed(event.id, 'Asset resolution failed');
      return false;
    }

    const writeInput: Prisma.LocationHistoryCreateInput = {
      asset: { connect: { id: asset.id } },
      timestamp: new Date(payload.recordedAt),
      coordinatesX: payload.longitude, // Mapping longitude to X coordinate
      coordinatesY: payload.latitude,  // Mapping latitude to Y coordinate
      trackingMethod: 'GPS',
      accuracyMeters: 5.0, // Default GPS accuracy
    };

    await this.prisma.$transaction(async (transaction) => {
      await transaction.locationHistory.create({ data: writeInput });

      await transaction.telemetryIngestEvent.update({
        where: { id: event.id },
        data: {
          status: 'processed',
          assetId: asset.id,
          processedAt: new Date(),
        },
      });
    });

    this.logger.debug(
      `Telemetry event ${event.id} processed for asset ${asset.id}`,
    );
    return true;
  }

  private async markEventFailed(
    eventId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.telemetryIngestEvent.update({
      where: { id: eventId },
      data: {
        status: 'failed',
        processedAt: new Date(),
      },
    });

    this.logger.warn(`Telemetry event ${eventId} failed processing: ${reason}`);
  }

  private async resolveAsset(
    eventAssetId?: string | null,
    payloadAssetId?: string | null,
    payloadExternalId?: string | null,
  ) {
    if (eventAssetId) {
      return this.prisma.asset.findUnique({ where: { id: eventAssetId } });
    }

    if (payloadAssetId) {
      return this.prisma.asset.findUnique({ where: { id: payloadAssetId } });
    }

    if (payloadExternalId) {
      return this.prisma.asset.findUnique({
        where: { assetTagNumber: payloadExternalId },
      });
    }

    return null;
  }
}
