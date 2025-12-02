import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { TelemetryIngestPayload } from '@biotrakr/types';
import { getMockTelemetryIngestEvents } from '@biotrakr/utils';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TelemetryIngestionSimulator {
  private readonly logger = new Logger(TelemetryIngestionSimulator.name);

  constructor(private readonly prisma: PrismaService) {}

  async seedMockEvents(limit = 10): Promise<number> {
    const mocks = getMockTelemetryIngestEvents().slice(0, limit);

    const result = await Promise.all(
      mocks.map(async (mock) => {
        const existing = await this.prisma.telemetryIngestEvent.findUnique({
          where: { id: mock.id },
        });

        if (existing) {
          return false;
        }

        await this.prisma.telemetryIngestEvent.create({
          data: {
            id: mock.id,
            assetId: mock.assetId ?? null,
            deviceId: mock.deviceId,
            payload: mock.payload as unknown as Prisma.JsonValue,
            receivedAt: new Date(mock.receivedAt),
            status: mock.status,
            processedAt: mock.processedAt ? new Date(mock.processedAt) : null,
          },
        });

        return true;
      }),
    );

    const created = result.filter(Boolean).length;
    this.logger.log(`Seeded ${created} mock telemetry ingest events.`);
    return created;
  }

  async enqueueTelemetryPayload(
    payload: TelemetryIngestPayload,
  ): Promise<void> {
    await this.prisma.telemetryIngestEvent.create({
      data: {
        deviceId: payload.deviceId,
        payload: payload as unknown as Prisma.JsonValue,
        status: 'pending',
        receivedAt: new Date(payload.recordedAt ?? Date.now()),
      },
    });
  }
}
