# Step 10 – Data Pipeline Integration

This document captures the design for ingesting real telemetry and maintenance
events into MedAsset Pro. It complements the shared packages introduced in
Step 7/9 and prepares the platform for Timescale/IoT wiring.

## Ingestion Contracts

- **TelemetryIngestPayload** (`@medasset/types`) – canonical JSON payload for
  device events (`deviceId`, coordinates, status, recordedAt, metadata).
- **TelemetryIngestEvent** – stored record that tracks raw payloads,
  processing status, and source device identifiers.
- **MaintenanceEventLog** – immutable audit trail for task lifecycle events.

```jsonc
{
  "deviceId": "rtls-device-302",
  "assetExternalId": "IP-001",
  "latitude": 42.34695,
  "longitude": -71.09722,
  "status": "in_use",
  "recordedAt": "2025-11-04T14:35:00Z",
  "metadata": { "rssi": -68, "batteryLevel": 74 }
}
```

## Storage Layout

| Table                     | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `telemetry_ingest_events` | Raw queue landing zone. Links to assets when resolved.        |
| `asset_location_pings`    | Curated trail used by dashboards/analytics (Step 9).          |
| `asset_scan_logs`         | Audit of QR scans captured from the dashboard workflow.       |
| `maintenance_tasks`       | Operational work orders.                                      |
| `maintenance_event_logs`  | Append-only log for scheduling/completion/notes events.       |

- `telemetry_ingest_events` is designed to map directly to a Timescale
  hypertable for efficient time-series queries.
- `maintenance_event_logs` can back future analytics (technician workload,
  SLA adherence).

## Configuration

`@medasset/config` now exposes `loadPipelineConfig`, validating:

- `TIMESCALE_URL` – optional connection string for Timescale/PG.
- `TELEMETRY_QUEUE_URL` – optional queue/broker for live device messages.
- `PIPELINE_BATCH_SIZE` (default 500) – max events per processing batch.
- `PIPELINE_POLL_INTERVAL_MS` (default 5000) – scheduler polling cadence.

## Orchestration Notes

- A lightweight worker (NestJS cron job, Bull queue consumer, or Fargate
  task) can call `loadPipelineConfig()` to hydrate connection settings.
- Processing flow:
  1. Fetch new `telemetry_ingest_events` (status `pending`).
  2. Map device identifiers → asset IDs (`asset_external_id` lookup).
  3. Write curated rows to `asset_location_pings` (hypertable insert).
  4. Update `telemetry_ingest_events.status` → `processed` or `failed` and
     record `processedAt`.
- Maintenance automation can append events to `maintenance_event_logs` to
  drive future notifications/analytics.
- The `dashboard/pipeline` monitor surfaces config and ingest status in the UI to aid operations during rollout.

## Next Steps

- Wire queue/Timescale credentials in environments via the new config loader.
- Implement the ingestion worker using the schema above (Step 10-2).
- The `TelemetryIngestionService` processes pending queue entries and persists curated pings; use `TelemetryIngestionSimulator` for local seeding/testing.
- Reference `docs/qr-scanning.md` for the QR audit trail flow that feeds `asset_scan_logs`.
- Update ML pipelines to read from `asset_location_pings` instead of synthetic
  datasets once the ingestion job runs continuously (Step 10-3).

