import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { loadPipelineConfig } from '@medasset/config';
import type {
  TelemetryIngestEvent as TelemetryIngestEventType,
  TelemetryIngestPayload,
} from '@medasset/types';

interface TelemetryIngestEventWithPayload extends TelemetryIngestEventType {
  payload: TelemetryIngestPayload;
}

@Injectable()
export class TelemetryIngestionService {
  private readonly logger = new Logger(TelemetryIngestionService.name);
  private readonly config = loadPipelineConfig();

  constructor(private readonly prisma: PrismaClient) {}

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
        this.processSingleEvent(event as TelemetryIngestEventWithPayload),
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

    const writeInput: Prisma.AssetLocationPingCreateInput = {
      asset: { connect: { id: asset.id } },
      latitude: payload.latitude,
      longitude: payload.longitude,
      status: payload.status,
      observedAt: new Date(payload.recordedAt),
      metadata: payload.metadata,
    };

    await this.prisma.$transaction(async (transaction) => {
      await transaction.assetLocationPing.create({ data: writeInput });

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
        where: { assetTag: payloadExternalId },
      });
    }

    return null;
  }
}
