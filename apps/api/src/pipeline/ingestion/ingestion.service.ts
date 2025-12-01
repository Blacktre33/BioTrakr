import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  TelemetryEventDto,
  RTLSEventDto,
  MaintenanceEventDto,
  ErrorEventDto,
  BatchTelemetryDto,
  IngestionResponseDto,
} from './dto/telemetry.dto';
import { EventSeverity, HealthStatus, FailureType } from './enums';

/**
 * Enhanced Ingestion Service
 *
 * Implements telemetry ingestion following BioTrakr labeling standards.
 * Uses Prisma for database access instead of TypeORM.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  // Valid enum values for validation
  private readonly validSeverities = Object.values(EventSeverity);
  private readonly validHealthStatuses = Object.values(HealthStatus);
  private readonly validFailureTypes = Object.values(FailureType);

  // Valid asset categories (from labeling guide)
  private readonly validAssetCategories = [
    'diagnostic_imaging',
    'life_support',
    'surgical',
    'laboratory',
    'patient_care',
    'infrastructure',
  ];

  // Valid event categories
  private readonly validEventCategories = [
    'location',
    'maintenance',
    'compliance',
    'operational',
    'system',
    'ml',
  ];

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================================
  // TELEMETRY INGESTION
  // ============================================================================

  async ingestTelemetryEvent(event: TelemetryEventDto): Promise<boolean> {
    try {
      // Validate the event
      const validationErrors = this.validateTelemetryEvent(event);
      if (validationErrors.length > 0) {
        this.logger.warn(
          `Validation failed: ${JSON.stringify(validationErrors)}`,
        );
        return false;
      }

      // Insert into TimescaleDB using Prisma
      // Note: This assumes asset_telemetry table exists from migrations
      await this.prisma.$executeRaw`
        INSERT INTO asset_telemetry (
          time, "assetId", "facilityId",
          asset_category, asset_type, department, risk_class,
          metric_name, metric_value, metric_unit,
          event_category, event_source, severity,
          health_score, health_status, anomaly_detected,
          failure_probability, predicted_failure_type, time_to_failure_hours,
          label_source, label_confidence, model_version,
          trace_id, service_name, raw_payload
        ) VALUES (
          ${new Date(event.timestamp)}::timestamptz,
          ${event.assetId}::uuid,
          ${event.facilityId}::uuid,
          ${event.assetCategory},
          ${event.assetType},
          ${event.department || null},
          null, -- risk_class - derived from asset_type
          ${event.name},
          ${event.value},
          ${event.unit},
          ${event.eventCategory},
          ${event.serviceName},
          ${event.severity},
          ${event.labels?.healthScore || null},
          ${event.labels?.healthStatus || null},
          ${event.labels?.anomalyDetected || null},
          ${event.labels?.failureProbability || null},
          ${event.labels?.predictedFailureType || null},
          ${event.labels?.timeToFailureHours || null},
          ${event.labelMetadata?.labelSource || null},
          ${event.labelMetadata?.labelConfidence || null},
          ${event.labelMetadata?.modelVersion || null},
          ${event.traceId || null},
          ${event.serviceName},
          ${event.rawPayload ? JSON.stringify(event.rawPayload) : null}::jsonb
        )
      `;

      // Update asset health score if provided
      if (event.labels?.healthScore !== undefined) {
        await this.updateAssetHealthScore(
          event.assetId,
          event.labels.healthScore,
        );
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to ingest telemetry: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  async ingestTelemetryBatch(
    batch: BatchTelemetryDto,
  ): Promise<IngestionResponseDto> {
    const errors: Array<{ index: number; message: string }> = [];
    let processed = 0;

    for (let i = 0; i < batch.events.length; i++) {
      try {
        const success = await this.ingestTelemetryEvent(batch.events[i]);
        if (success) {
          processed++;
        } else {
          errors.push({ index: i, message: 'Ingestion failed' });
        }
      } catch (error) {
        errors.push({ index: i, message: error.message || 'Unknown error' });
      }
    }

    return {
      success: errors.length === 0,
      processed,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ============================================================================
  // RTLS INGESTION
  // ============================================================================

  async ingestRTLSEvent(event: RTLSEventDto): Promise<boolean> {
    try {
      // Map SourceType to TrackingMethod enum
      const trackingMethodMap: Record<
        string,
        'RFID' | 'BLE' | 'GPS' | 'MANUAL' | 'QR' | 'NFC'
      > = {
        rfid: 'RFID',
        ble: 'BLE',
        wifi: 'BLE', // Map WiFi to BLE as closest match
        gps: 'GPS',
        manual: 'MANUAL',
        scan: 'QR',
      };

      // Insert RTLS event into location_history table
      await this.prisma.locationHistory.create({
        data: {
          assetId: event.assetId,
          timestamp: new Date(event.timestamp),
          coordinatesX: event.coordinates?.x || null,
          coordinatesY: event.coordinates?.y || null,
          coordinatesZ: event.coordinates?.z || null,
          trackingMethod:
            trackingMethodMap[event.sourceType.toLowerCase()] || 'MANUAL',
          accuracyMeters: event.accuracyMeters || null,
          // metadata: event.rawPayload || {}, // Not in schema
        },
      });

      // Update asset location if high confidence
      if (event.confidence && event.confidence >= 0.8 && event.locationId) {
        await this.updateAssetLocation(event.assetId, event.locationId);
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to ingest RTLS event: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  // ============================================================================
  // MAINTENANCE EVENT INGESTION
  // ============================================================================

  async ingestMaintenanceEvent(event: MaintenanceEventDto): Promise<boolean> {
    try {
      // Insert maintenance event
      // Note: This assumes maintenance_events table exists from migrations
      await this.prisma.$executeRaw`
        INSERT INTO maintenance_events (
          time, "assetId", "facilityId", work_order_id,
          event_type, maintenance_type,
          failure_occurred, failure_type, failure_code, root_cause,
          parts_replaced, labor_hours, downtime_hours, cost,
          technician_id, notes, raw_payload
        ) VALUES (
          ${new Date(event.timestamp)}::timestamptz,
          ${event.assetId}::uuid,
          ${event.facilityId}::uuid,
          ${event.workOrderId || null}::uuid,
          ${event.eventType},
          ${event.maintenanceType || null},
          ${event.failureOccurred || false},
          ${event.failureType || null},
          ${event.failureCode || null},
          ${event.rootCause || null},
          ${event.partsReplaced ? JSON.stringify(event.partsReplaced) : null}::jsonb,
          ${event.laborHours || null},
          ${event.downtimeHours || null},
          ${event.cost || null},
          ${event.technicianId || null}::uuid,
          ${event.notes || null},
          ${event.rawPayload ? JSON.stringify(event.rawPayload) : null}::jsonb
        )
      `;

      // Update asset maintenance dates if PM completed
      if (event.eventType === 'pm_completed') {
        await this.updateAssetMaintenanceDates(event.assetId);
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to ingest maintenance event: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  // ============================================================================
  // ERROR EVENT INGESTION
  // ============================================================================

  async ingestErrorEvent(event: ErrorEventDto): Promise<boolean> {
    try {
      // Insert error event
      // Note: This assumes error_events table exists from migrations
      await this.prisma.$executeRaw`
        INSERT INTO error_events (
          time, "assetId", "facilityId",
          error_code, error_message, error_category, severity,
          component, operation, sensor_readings,
          auto_recovered, requires_intervention, raw_payload
        ) VALUES (
          ${new Date(event.timestamp)}::timestamptz,
          ${event.assetId}::uuid,
          ${event.facilityId}::uuid,
          ${event.errorCode},
          ${event.errorMessage || null},
          ${event.errorCategory || null},
          ${event.severity},
          ${event.component || null},
          ${event.operation || null},
          ${event.sensorReadings ? JSON.stringify(event.sensorReadings) : null}::jsonb,
          ${event.autoRecovered || false},
          ${event.requiresIntervention || false},
          ${event.rawPayload ? JSON.stringify(event.rawPayload) : null}::jsonb
        )
      `;

      // Update asset condition if critical error
      if (
        event.severity === EventSeverity.CRITICAL &&
        event.requiresIntervention
      ) {
        await this.updateAssetCondition(event.assetId, 'critical');
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to ingest error event: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  private validateTelemetryEvent(event: TelemetryEventDto): string[] {
    const errors: string[] = [];

    // Validate metric name format (domain.entity.action.metric_type)
    const nameParts = event.name.split('.');
    if (nameParts.length < 3) {
      errors.push(
        `Invalid metric name format: ${event.name}. Expected: domain.entity.action[.metric_type]`,
      );
    }

    // Validate severity
    if (!this.validSeverities.includes(event.severity)) {
      errors.push(`Invalid severity: ${event.severity}`);
    }

    // Validate event category
    if (!this.validEventCategories.includes(event.eventCategory)) {
      errors.push(`Invalid event category: ${event.eventCategory}`);
    }

    // Validate ML labels if provided
    if (event.labels) {
      if (event.labels.healthScore !== undefined) {
        if (event.labels.healthScore < 0 || event.labels.healthScore > 100) {
          errors.push(
            `Health score must be 0-100: ${event.labels.healthScore}`,
          );
        }
      }

      if (
        event.labels.healthStatus &&
        !this.validHealthStatuses.includes(event.labels.healthStatus)
      ) {
        errors.push(`Invalid health status: ${event.labels.healthStatus}`);
      }

      if (event.labels.failureProbability !== undefined) {
        if (
          event.labels.failureProbability < 0 ||
          event.labels.failureProbability > 1
        ) {
          errors.push(
            `Failure probability must be 0-1: ${event.labels.failureProbability}`,
          );
        }
      }
    }

    // Validate label metadata
    if (event.labelMetadata?.labelConfidence !== undefined) {
      if (
        event.labelMetadata.labelConfidence < 0 ||
        event.labelMetadata.labelConfidence > 1
      ) {
        errors.push(
          `Label confidence must be 0-1: ${event.labelMetadata.labelConfidence}`,
        );
      }
    }

    return errors;
  }

  // ============================================================================
  // ASSET UPDATE HELPERS
  // ============================================================================

  private async updateAssetHealthScore(
    assetId: string,
    healthScore: number,
  ): Promise<void> {
    // Note: Asset model doesn't have healthScore field directly
    // Health scores are stored in telemetry/predictive_scores_history tables
    // This could be updated to store in a custom field or computed view
    this.logger.debug(
      `Health score ${healthScore} for asset ${assetId} stored in telemetry`,
    );
  }

  private async updateAssetLocation(
    assetId: string,
    locationId: string,
  ): Promise<void> {
    // Update asset's current room location
    await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        currentRoomId: locationId,
        lastSeenTimestamp: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private async updateAssetMaintenanceDates(assetId: string): Promise<void> {
    // Get asset to determine PM interval
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true },
    });

    if (asset) {
      const pmInterval = 90; // Default PM interval in days
      await this.prisma.asset.update({
        where: { id: assetId },
        data: {
          lastPmDate: new Date(),
          nextPmDueDate: new Date(
            Date.now() + pmInterval * 24 * 60 * 60 * 1000,
          ),
          updatedAt: new Date(),
        },
      });
    }
  }

  private async updateAssetCondition(
    assetId: string,
    condition: string,
  ): Promise<void> {
    // Note: Asset model uses assetStatus, not condition
    // Update status based on condition severity
    const statusMap: Record<string, 'IN_MAINTENANCE' | 'QUARANTINED'> = {
      critical: 'QUARANTINED',
      poor: 'IN_MAINTENANCE',
      fair: 'IN_MAINTENANCE',
    };

    const newStatus = statusMap[condition.toLowerCase()];
    if (newStatus) {
      await this.prisma.asset.update({
        where: { id: assetId },
        data: {
          assetStatus: newStatus,
          updatedAt: new Date(),
        },
      });
    }
  }

  // ============================================================================
  // HEALTH SCORE CALCULATION
  // ============================================================================

  /**
   * Map RUL (Remaining Useful Life) to health status
   * Based on labeling guide time-to-failure windows
   */
  mapRulToHealthStatus(timeToFailureHours: number): HealthStatus {
    if (timeToFailureHours <= 24) {
      return HealthStatus.CRITICAL;
    } else if (timeToFailureHours <= 168) {
      // 1-7 days
      return HealthStatus.POOR;
    } else if (timeToFailureHours <= 720) {
      // 7-30 days
      return HealthStatus.FAIR;
    } else if (timeToFailureHours <= 2160) {
      // 30-90 days
      return HealthStatus.GOOD;
    } else {
      return HealthStatus.EXCELLENT;
    }
  }

  /**
   * Calculate health score from various metrics
   */
  calculateHealthScore(metrics: {
    operatingHours?: number;
    expectedLifeHours?: number;
    errorCount24h?: number;
    daysSinceLastPm?: number;
    pmIntervalDays?: number;
    failureProbability?: number;
  }): number {
    let score = 100;

    // Operating hours factor (0-25 points)
    if (metrics.operatingHours && metrics.expectedLifeHours) {
      const usageRatio = metrics.operatingHours / metrics.expectedLifeHours;
      score -= Math.min(25, usageRatio * 30);
    }

    // Error count factor (0-25 points)
    if (metrics.errorCount24h) {
      score -= Math.min(25, metrics.errorCount24h * 5);
    }

    // PM overdue factor (0-25 points)
    if (metrics.daysSinceLastPm && metrics.pmIntervalDays) {
      const overdueRatio = metrics.daysSinceLastPm / metrics.pmIntervalDays;
      if (overdueRatio > 1) {
        score -= Math.min(25, (overdueRatio - 1) * 20);
      }
    }

    // ML prediction factor (0-25 points)
    if (metrics.failureProbability) {
      score -= metrics.failureProbability * 25;
    }

    return Math.max(0, Math.round(score));
  }
}
