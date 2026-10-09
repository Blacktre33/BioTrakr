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
import {
  IngestionService,
  IngestionValidationError,
} from './ingestion.service';
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

const NOT_IN_SCOPE = 'Asset or facility not found in your organization';
const OK: IngestionResponseDto = { success: true, processed: 1, failed: 0 };

/**
 * Device gateways and integrations push events here (admin or integration
 * role). Mounted at /api/v1/ingest/* under the global /api prefix.
 *
 * Errors: 400 for invalid events, 404 when the asset or facility is not in
 * the caller's organization, 5xx when storage fails (so gateways retry).
 */
@ApiTags('Ingestion')
@ApiBearerAuth()
@Roles(...INGESTION_ROLES)
@Controller('v1/ingest')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(private readonly ingestionService: IngestionService) {}

  // ============================================================================
  // TELEMETRY
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
    await this.run(() => this.ingestionService.ingestTelemetryEvent(event));
    return OK;
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
    return this.processBatch(batch.events, user, (event) =>
      this.ingestionService.ingestTelemetryEvent(event),
    );
  }

  // ============================================================================
  // RTLS
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
    await this.run(() =>
      this.ingestionService.ingestRTLSEvent(event, user.organizationId),
    );
    return OK;
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
    return this.processBatch(batch.events, user, (event) =>
      this.ingestionService.ingestRTLSEvent(event, user.organizationId),
    );
  }

  // ============================================================================
  // MAINTENANCE
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
    await this.run(() =>
      this.ingestionService.ingestMaintenanceEvent(event, user.organizationId),
    );
    return OK;
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
    return this.processBatch(batch.events, user, (event) =>
      this.ingestionService.ingestMaintenanceEvent(event, user.organizationId),
    );
  }

  // ============================================================================
  // ERRORS
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
    await this.run(() =>
      this.ingestionService.ingestErrorEvent(event, user.organizationId),
    );
    return OK;
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
      throw new NotFoundException(NOT_IN_SCOPE);
    }
  }

  /** Validation problems become 400s; storage failures propagate as 5xx. */
  private async run(ingest: () => Promise<void>): Promise<void> {
    try {
      await ingest();
    } catch (error) {
      if (error instanceof IngestionValidationError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      throw error;
    }
  }

  private async processBatch<T extends ScopedEvent>(
    events: T[],
    user: AuthUser,
    ingest: (event: T) => Promise<void>,
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
          errors.push({ index: i, message: NOT_IN_SCOPE });
          continue;
        }
        await ingest(events[i]);
        processed++;
      } catch (error) {
        if (error instanceof IngestionValidationError) {
          errors.push({ index: i, message: error.message });
        } else {
          // Don't echo database internals back to the caller.
          this.logger.error(
            `Batch event ${i} failed to store`,
            (error as Error).stack,
          );
          errors.push({
            index: i,
            message: 'Storage failed; retry this event',
          });
        }
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
