import { Injectable, Logger } from '@nestjs/common';
import type {
  Prisma,
  TelemetryFailureType,
  TelemetryHealthStatus,
  TelemetryLabelSource,
  TelemetrySeverity,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import {
  TelemetryEventDto,
  RTLSEventDto,
  MaintenanceEventDto,
  ErrorEventDto,
} from './dto/telemetry.dto';
import { EventSeverity, HealthStatus } from './enums';

/** Rejected by the labeling rules; the caller should get a 400 with these messages. */
export class IngestionValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`Validation failed: ${errors.join('; ')}`);
  }
}

/** Used when PM frequency is not recorded on the asset. */
export const DEFAULT_PM_INTERVAL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * DTO enums carry the lower-case database values (e.g. "critical"); the
 * Prisma enums use upper-case names (CRITICAL) mapped to those values.
 */
function toPrismaEnum<T extends string>(
  value: string | undefined | null,
): T | null {
  return value ? (value.toUpperCase() as T) : null;
}

/**
 * Ingestion service
 *
 * Writes telemetry, RTLS, maintenance and error events following the
 * BioTrakr telemetry labeling guide. Callers must have checked that the
 * event's asset and facility belong to their organization
 * (see isInOrganization); every asset update here is scoped again.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  private readonly validSeverities = Object.values(EventSeverity);
  private readonly validHealthStatuses = Object.values(HealthStatus);

  private readonly validEventCategories = [
    'location',
    'maintenance',
    'compliance',
    'operational',
    'system',
    'ml',
  ];

  constructor(private readonly prisma: PrismaService) {}

  /** True if both the asset and the facility belong to the given organization. */
  async isInOrganization(
    organizationId: string,
    assetId: string,
    facilityId: string,
  ): Promise<boolean> {
    const [assets, facilities] = await Promise.all([
      this.prisma.asset.count({
        where: { id: assetId, organizationId, deletedAt: null },
      }),
      this.prisma.facility.count({ where: { id: facilityId, organizationId } }),
    ]);
    return assets > 0 && facilities > 0;
  }

  // ============================================================================
  // TELEMETRY
  // ============================================================================

  /** Throws IngestionValidationError for bad labels; database errors propagate. */
  async ingestTelemetryEvent(event: TelemetryEventDto): Promise<void> {
    const validationErrors = this.validateTelemetryEvent(event);
    if (validationErrors.length > 0) {
      throw new IngestionValidationError(validationErrors);
    }

    // `??` (not `||`) everywhere: 0 and false are real readings, not "missing".
    await this.prisma.assetTelemetry.create({
      data: {
        time: new Date(event.timestamp),
        assetId: event.assetId,
        facilityId: event.facilityId,
        assetCategory: event.assetCategory,
        assetType: event.assetType,
        department: event.department ?? null,
        metricName: event.name,
        metricValue: event.value,
        metricUnit: event.unit,
        eventCategory: event.eventCategory,
        eventSource: event.serviceName,
        severity: toPrismaEnum<TelemetrySeverity>(event.severity),
        healthScore: event.labels?.healthScore ?? null,
        healthStatus: toPrismaEnum<TelemetryHealthStatus>(
          event.labels?.healthStatus,
        ),
        anomalyDetected: event.labels?.anomalyDetected ?? null,
        failureProbability: event.labels?.failureProbability ?? null,
        predictedFailureType: toPrismaEnum<TelemetryFailureType>(
          event.labels?.predictedFailureType,
        ),
        timeToFailureHours: event.labels?.timeToFailureHours ?? null,
        labelSource: toPrismaEnum<TelemetryLabelSource>(
          event.labelMetadata?.labelSource,
        ),
        labelConfidence: event.labelMetadata?.labelConfidence ?? null,
        modelVersion: event.labelMetadata?.modelVersion ?? null,
        traceId: event.traceId ?? null,
        serviceName: event.serviceName,
        rawPayload: (event.rawPayload as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  // ============================================================================
  // RTLS
  // ============================================================================

  async ingestRTLSEvent(
    event: RTLSEventDto,
    organizationId: string,
  ): Promise<void> {
    const trackingMethodMap: Record<
      string,
      'RFID' | 'BLE' | 'GPS' | 'MANUAL' | 'QR' | 'NFC'
    > = {
      rfid: 'RFID',
      ble: 'BLE',
      wifi: 'BLE', // closest supported tracking method
      gps: 'GPS',
      manual: 'MANUAL',
      scan: 'QR',
    };
    const eventTime = new Date(event.timestamp);

    await this.prisma.locationHistory.create({
      data: {
        assetId: event.assetId,
        timestamp: eventTime,
        // A coordinate of 0 is a real position on the floor plan.
        coordinatesX: event.coordinates?.x ?? null,
        coordinatesY: event.coordinates?.y ?? null,
        coordinatesZ: event.coordinates?.z ?? null,
        trackingMethod:
          trackingMethodMap[event.sourceType.toLowerCase()] ?? 'MANUAL',
        accuracyMeters: event.accuracyMeters ?? null,
        signalStrength:
          event.signalStrengthDbm !== undefined
            ? Math.round(event.signalStrengthDbm)
            : null,
      },
    });

    // Move the asset only on high-confidence fixes.
    if (
      event.confidence !== undefined &&
      event.confidence >= 0.8 &&
      event.locationId
    ) {
      await this.updateAssetLocation(
        event.assetId,
        event.locationId,
        organizationId,
        eventTime,
      );
    }
  }

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

  async ingestMaintenanceEvent(
    event: MaintenanceEventDto,
    organizationId: string,
  ): Promise<void> {
    const eventTime = new Date(event.timestamp);

    await this.prisma.maintenanceEvent.create({
      data: {
        time: eventTime,
        assetId: event.assetId,
        facilityId: event.facilityId,
        workOrderId: event.workOrderId ?? null,
        eventType: event.eventType,
        maintenanceType: event.maintenanceType ?? null,
        failureOccurred: event.failureOccurred ?? false,
        failureType: toPrismaEnum<TelemetryFailureType>(event.failureType),
        failureCode: event.failureCode ?? null,
        rootCause: event.rootCause ?? null,
        partsReplaced:
          (event.partsReplaced as Prisma.InputJsonValue) ?? undefined,
        laborHours: event.laborHours ?? null,
        downtimeHours: event.downtimeHours ?? null,
        cost: event.cost ?? null,
        technicianId: event.technicianId ?? null,
        notes: event.notes ?? null,
        rawPayload: (event.rawPayload as Prisma.InputJsonValue) ?? undefined,
      },
    });

    if (event.eventType === 'pm_completed') {
      await this.updateAssetMaintenanceDates(
        event.assetId,
        organizationId,
        eventTime,
      );
    }
  }

  // ============================================================================
  // ERRORS
  // ============================================================================

  async ingestErrorEvent(
    event: ErrorEventDto,
    organizationId: string,
  ): Promise<void> {
    await this.prisma.errorEvent.create({
      data: {
        time: new Date(event.timestamp),
        assetId: event.assetId,
        facilityId: event.facilityId,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage ?? null,
        errorCategory: event.errorCategory ?? null,
        severity: toPrismaEnum<TelemetrySeverity>(event.severity)!,
        component: event.component ?? null,
        operation: event.operation ?? null,
        sensorReadings:
          (event.sensorReadings as Prisma.InputJsonValue) ?? undefined,
        autoRecovered: event.autoRecovered ?? false,
        requiresIntervention: event.requiresIntervention ?? false,
        rawPayload: (event.rawPayload as Prisma.InputJsonValue) ?? undefined,
      },
    });

    // A critical fault that needs intervention takes the device out of use.
    if (
      event.severity === EventSeverity.CRITICAL &&
      event.requiresIntervention
    ) {
      await this.quarantineAsset(event.assetId, organizationId);
    }
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  private validateTelemetryEvent(event: TelemetryEventDto): string[] {
    const errors: string[] = [];

    // Metric name format: domain.entity.action[.metric_type]
    if (event.name.split('.').length < 3) {
      errors.push(
        `Invalid metric name format: ${event.name}. Expected: domain.entity.action[.metric_type]`,
      );
    }

    if (!this.validSeverities.includes(event.severity)) {
      errors.push(`Invalid severity: ${event.severity}`);
    }

    if (!this.validEventCategories.includes(event.eventCategory)) {
      errors.push(`Invalid event category: ${event.eventCategory}`);
    }

    if (event.labels) {
      const { healthScore, healthStatus, failureProbability } = event.labels;
      if (healthScore !== undefined) {
        if (
          !Number.isInteger(healthScore) ||
          healthScore < 0 ||
          healthScore > 100
        ) {
          errors.push(
            `Health score must be a whole number 0-100: ${healthScore}`,
          );
        }
      }
      if (healthStatus && !this.validHealthStatuses.includes(healthStatus)) {
        errors.push(`Invalid health status: ${healthStatus}`);
      }
      if (
        failureProbability !== undefined &&
        (failureProbability < 0 || failureProbability > 1)
      ) {
        errors.push(`Failure probability must be 0-1: ${failureProbability}`);
      }
    }

    const labelConfidence = event.labelMetadata?.labelConfidence;
    if (
      labelConfidence !== undefined &&
      (labelConfidence < 0 || labelConfidence > 1)
    ) {
      errors.push(`Label confidence must be 0-1: ${labelConfidence}`);
    }

    return errors;
  }

  // ============================================================================
  // ASSET UPDATE HELPERS (all scoped to the organization and to live assets)
  // ============================================================================

  private async updateAssetLocation(
    assetId: string,
    locationId: string,
    organizationId: string,
    eventTime: Date,
  ): Promise<void> {
    // Only move the asset into a room of its own organization.
    const roomInOrg = await this.prisma.room.count({
      where: {
        id: locationId,
        floor: { building: { facility: { organizationId } } },
      },
    });
    if (roomInOrg === 0) {
      this.logger.warn(
        `RTLS event for asset ${assetId} named a room outside its organization; location not updated`,
      );
      return;
    }

    // Ignore fixes older than the last one we applied (late or replayed events).
    await this.prisma.asset.updateMany({
      where: {
        id: assetId,
        organizationId,
        deletedAt: null,
        OR: [
          { lastSeenTimestamp: null },
          { lastSeenTimestamp: { lte: eventTime } },
        ],
      },
      data: { currentRoomId: locationId, lastSeenTimestamp: eventTime },
    });
  }

  private async updateAssetMaintenanceDates(
    assetId: string,
    organizationId: string,
    completedAt: Date,
  ): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId, deletedAt: null },
      select: { pmFrequencyDays: true },
    });
    if (!asset) return;

    const intervalDays = asset.pmFrequencyDays ?? DEFAULT_PM_INTERVAL_DAYS;
    // The PM dates come from when the work was done, not when the event arrived,
    // and an older event never moves the dates backwards.
    await this.prisma.asset.updateMany({
      where: {
        id: assetId,
        organizationId,
        deletedAt: null,
        OR: [{ lastPmDate: null }, { lastPmDate: { lt: completedAt } }],
      },
      data: {
        lastPmDate: completedAt,
        nextPmDueDate: new Date(completedAt.getTime() + intervalDays * DAY_MS),
      },
    });
  }

  private async quarantineAsset(
    assetId: string,
    organizationId: string,
  ): Promise<void> {
    await this.prisma.asset.updateMany({
      where: { id: assetId, organizationId, deletedAt: null },
      data: { assetStatus: 'QUARANTINED' },
    });
  }

  // ============================================================================
  // HEALTH SCORE HELPERS
  // ============================================================================

  /**
   * Map RUL (remaining useful life, in hours) to health status.
   * Based on labeling guide time-to-failure windows.
   */
  mapRulToHealthStatus(timeToFailureHours: number): HealthStatus {
    if (timeToFailureHours <= 24) return HealthStatus.CRITICAL;
    if (timeToFailureHours <= 168) return HealthStatus.POOR; // 1-7 days
    if (timeToFailureHours <= 720) return HealthStatus.FAIR; // 7-30 days
    if (timeToFailureHours <= 2160) return HealthStatus.GOOD; // 30-90 days
    return HealthStatus.EXCELLENT;
  }
}
