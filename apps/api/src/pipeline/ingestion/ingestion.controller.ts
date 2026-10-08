import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UsePipes,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser, Roles } from '../../auth/decorators';
import { INGESTION_ROLES } from '../../auth/roles';
import { IngestionService } from './ingestion.service';
import {
  TelemetryEventDto,
  RTLSEventDto,
  MaintenanceEventDto,
  ErrorEventDto,
  BatchTelemetryDto,
  BatchRTLSDto,
  BatchMaintenanceDto,
  IngestionResponseDto,
} from './dto/telemetry.dto';

type ScopedEvent = { assetId: string; facilityId: string };

@ApiTags('Ingestion')
@ApiBearerAuth()
@Roles(...INGESTION_ROLES)
@Controller('api/v1/ingest')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(private readonly ingestionService: IngestionService) {}

  // ============================================================================
  // TELEMETRY ENDPOINTS
  // ============================================================================

  @Post('telemetry')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest a single telemetry event' })
  @ApiResponse({ status: 201, description: 'Event ingested successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async ingestTelemetry(
    @Body() event: TelemetryEventDto,
    @CurrentUser() user: AuthUser,
  ): Promise<IngestionResponseDto> {
    await this.assertInScope(event, user);
    this.logger.log(
      `Ingesting telemetry: ${event.name} for asset ${event.assetId}`,
    );

    const success = await this.ingestionService.ingestTelemetryEvent(event);
    if (!success) {
      throw new BadRequestException('Failed to ingest telemetry event');
    }
    return { success: true, processed: 1, failed: 0 };
  }

  @Post('telemetry/batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest multiple telemetry events in batch' })
  @ApiBody({ type: BatchTelemetryDto })
  @ApiResponse({ status: 201, description: 'Batch processed' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async ingestTelemetryBatch(
    @Body() batch: BatchTelemetryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<IngestionResponseDto> {
    this.logger.log(`Ingesting telemetry batch: ${batch.events.length} events`);
    return this.processBatch(batch.events, user, (event) =>
      this.ingestionService.ingestTelemetryEvent(event),
    );
  }

  // ============================================================================
  // RTLS ENDPOINTS
  // ============================================================================

  @Post('rtls')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest a single RTLS location event' })
  @ApiResponse({ status: 201, description: 'Event ingested successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async ingestRTLS(
    @Body() event: RTLSEventDto,
    @CurrentUser() user: AuthUser,
  ): Promise<IngestionResponseDto> {
    await this.assertInScope(event, user);
    this.logger.log(
      `Ingesting RTLS: ${event.eventType} for asset ${event.assetId}`,
    );

    const success = await this.ingestionService.ingestRTLSEvent(event);
    if (!success) {
      throw new BadRequestException('Failed to ingest RTLS event');
    }
    return { success: true, processed: 1, failed: 0 };
  }

  @Post('rtls/batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest multiple RTLS events in batch' })
  @ApiBody({ type: BatchRTLSDto })
  @ApiResponse({ status: 201, description: 'Batch processed' })
  async ingestRTLSBatch(
    @Body() batch: BatchRTLSDto,
    @CurrentUser() user: AuthUser,
  ): Promise<IngestionResponseDto> {
    this.logger.log(`Ingesting RTLS batch: ${batch.events.length} events`);
    return this.processBatch(batch.events, user, (event) =>
      this.ingestionService.ingestRTLSEvent(event),
    );
  }

  // ============================================================================
  // MAINTENANCE EVENT ENDPOINTS
  // ============================================================================

  @Post('maintenance')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest a maintenance event' })
  @ApiResponse({ status: 201, description: 'Event ingested successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async ingestMaintenance(
    @Body() event: MaintenanceEventDto,
    @CurrentUser() user: AuthUser,
  ): Promise<IngestionResponseDto> {
    await this.assertInScope(event, user);
    this.logger.log(
      `Ingesting maintenance: ${event.eventType} for asset ${event.assetId}`,
    );

    const success = await this.ingestionService.ingestMaintenanceEvent(event);
    if (!success) {
      throw new BadRequestException('Failed to ingest maintenance event');
    }
    return { success: true, processed: 1, failed: 0 };
  }

  @Post('maintenance/batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest multiple maintenance events in batch' })
  @ApiBody({ type: BatchMaintenanceDto })
  @ApiResponse({ status: 201, description: 'Batch processed' })
  async ingestMaintenanceBatch(
    @Body() batch: BatchMaintenanceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<IngestionResponseDto> {
    this.logger.log(
      `Ingesting maintenance batch: ${batch.events.length} events`,
    );
    return this.processBatch(batch.events, user, (event) =>
      this.ingestionService.ingestMaintenanceEvent(event),
    );
  }

  // ============================================================================
  // ERROR EVENT ENDPOINTS
  // ============================================================================

  @Post('error')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest an error event' })
  @ApiResponse({ status: 201, description: 'Event ingested successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async ingestError(
    @Body() event: ErrorEventDto,
    @CurrentUser() user: AuthUser,
  ): Promise<IngestionResponseDto> {
    await this.assertInScope(event, user);
    this.logger.log(
      `Ingesting error: ${event.errorCode} for asset ${event.assetId}`,
    );

    const success = await this.ingestionService.ingestErrorEvent(event);
    if (!success) {
      throw new BadRequestException('Failed to ingest error event');
    }
    return { success: true, processed: 1, failed: 0 };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /** 404 unless the event's asset and facility belong to the caller's organization. */
  private async assertInScope(
    event: ScopedEvent,
    user: AuthUser,
  ): Promise<void> {
    const ok = await this.ingestionService.isInOrganization(
      user.organizationId,
      event.assetId,
      event.facilityId,
    );
    if (!ok) {
      throw new NotFoundException(
        'Asset or facility not found in your organization',
      );
    }
  }

  private async processBatch<T extends ScopedEvent>(
    events: T[],
    user: AuthUser,
    ingest: (event: T) => Promise<boolean>,
  ): Promise<IngestionResponseDto> {
    let processed = 0;
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < events.length; i++) {
      try {
        const inScope = await this.ingestionService.isInOrganization(
          user.organizationId,
          events[i].assetId,
          events[i].facilityId,
        );
        if (!inScope) {
          errors.push({
            index: i,
            message: 'Asset or facility not found in your organization',
          });
          continue;
        }
        if (await ingest(events[i])) {
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
}
