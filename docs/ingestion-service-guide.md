# BioTrakr Ingestion Service - Usage Guide

## Overview

This document provides examples for using the BioTrakr data ingestion service. The service implements the telemetry labeling standards and supports batch ingestion for high-volume data.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/ingest/telemetry` | POST | Single telemetry event |
| `/api/v1/ingest/telemetry/batch` | POST | Batch telemetry events |
| `/api/v1/ingest/rtls` | POST | Single RTLS location event |
| `/api/v1/ingest/rtls/batch` | POST | Batch RTLS events |
| `/api/v1/ingest/maintenance` | POST | Single maintenance event |
| `/api/v1/ingest/maintenance/batch` | POST | Batch maintenance events |
| `/api/v1/ingest/error` | POST | Single error event |

---

## Example: Telemetry Event

### Request

```bash
curl -X POST http://localhost:3000/api/v1/ingest/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "name": "asset.infusion_pump.temperature.reading_celsius",
    "timestamp": "2025-11-18T14:32:00.000Z",
    "facilityId": "550e8400-e29b-41d4-a716-446655440001",
    "assetId": "550e8400-e29b-41d4-a716-446655440002",
    "environment": "production",
    "serviceName": "iot-collector",
    "traceId": "abc123def456",
    
    "assetCategory": "life_support",
    "assetType": "infusion_pump",
    "department": "intensive_care_unit",
    "eventCategory": "operational",
    "severity": "info",
    
    "value": 38.5,
    "unit": "celsius",
    
    "labels": {
      "healthScore": 72,
      "healthStatus": "good",
      "anomalyDetected": false,
      "failureProbability": 0.08
    },
    
    "labelMetadata": {
      "labelSource": "automated",
      "labelConfidence": 0.92,
      "modelVersion": "pm-model-v1.2.3"
    }
  }'
```

### Response

```json
{
  "success": true,
  "processed": 1,
  "failed": 0
}
```

---

## Example: Batch Telemetry Events

### Request

```bash
curl -X POST http://localhost:3000/api/v1/ingest/telemetry/batch \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "name": "asset.ventilator.pressure.reading_kpa",
        "timestamp": "2025-11-18T14:32:00.000Z",
        "facilityId": "550e8400-e29b-41d4-a716-446655440001",
        "assetId": "550e8400-e29b-41d4-a716-446655440003",
        "environment": "production",
        "serviceName": "iot-collector",
        "assetCategory": "life_support",
        "assetType": "ventilator",
        "eventCategory": "operational",
        "severity": "info",
        "value": 25.3,
        "unit": "kpa"
      },
      {
        "name": "asset.ventilator.flow_rate.reading_lpm",
        "timestamp": "2025-11-18T14:32:00.000Z",
        "facilityId": "550e8400-e29b-41d4-a716-446655440001",
        "assetId": "550e8400-e29b-41d4-a716-446655440003",
        "environment": "production",
        "serviceName": "iot-collector",
        "assetCategory": "life_support",
        "assetType": "ventilator",
        "eventCategory": "operational",
        "severity": "info",
        "value": 12.5,
        "unit": "lpm"
      }
    ]
  }'
```

### Response

```json
{
  "success": true,
  "processed": 2,
  "failed": 0
}
```

---

## Example: RTLS Location Event

### Request

```bash
curl -X POST http://localhost:3000/api/v1/ingest/rtls \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2025-11-18T14:32:05.000Z",
    "assetId": "550e8400-e29b-41d4-a716-446655440002",
    "facilityId": "550e8400-e29b-41d4-a716-446655440001",
    "locationId": "550e8400-e29b-41d4-a716-446655440010",
    "zoneId": "icu-north",
    "floor": "3",
    "building": "main",
    "coordinates": {
      "x": 125.5,
      "y": 89.2,
      "z": 0
    },
    "signalStrengthDbm": -65,
    "confidence": 0.95,
    "accuracyMeters": 1.5,
    "tagId": "TAG-001234",
    "readerId": "READER-ICU-01",
    "sourceType": "ble",
    "eventType": "position_update"
  }'
```

---

## Example: Maintenance Event

### Request

```bash
curl -X POST http://localhost:3000/api/v1/ingest/maintenance \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2025-11-18T10:00:00.000Z",
    "assetId": "550e8400-e29b-41d4-a716-446655440002",
    "facilityId": "550e8400-e29b-41d4-a716-446655440001",
    "workOrderId": "550e8400-e29b-41d4-a716-446655440020",
    "eventType": "pm_completed",
    "maintenanceType": "preventive",
    "failureOccurred": false,
    "partsReplaced": [
      {
        "partNumber": "TUBE-SET-100",
        "partName": "IV Tube Set",
        "quantity": 1
      }
    ],
    "laborHours": 1.5,
    "downtimeHours": 2.0,
    "cost": 150.00,
    "technicianId": "550e8400-e29b-41d4-a716-446655440030",
    "notes": "Replaced tube set during scheduled PM. All checks passed."
  }'
```

---

## Example: Error Event

### Request

```bash
curl -X POST http://localhost:3000/api/v1/ingest/error \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2025-11-18T14:45:00.000Z",
    "assetId": "550e8400-e29b-41d4-a716-446655440002",
    "facilityId": "550e8400-e29b-41d4-a716-446655440001",
    "errorCode": "E-TEMP-HIGH",
    "errorMessage": "Temperature exceeded threshold",
    "errorCategory": "thermal",
    "severity": "high",
    "component": "pump_motor",
    "operation": "continuous_infusion",
    "sensorReadings": {
      "temperature": 42.5,
      "pressure": 25.0,
      "flow_rate": 12.0
    },
    "autoRecovered": false,
    "requiresIntervention": true
  }'
```

---

## Naming Convention Examples

Following the `{domain}.{entity}.{action}.{metric_type}` pattern:

| Metric Name | Domain | Entity | Action | Type |
|-------------|--------|--------|--------|------|
| `asset.infusion_pump.temperature.reading_celsius` | asset | infusion_pump | temperature | reading_celsius |
| `rtls.beacon.signal.strength_dbm` | rtls | beacon | signal | strength_dbm |
| `maintenance.work_order.created.count` | maintenance | work_order | created | count |
| `compliance.certification.expiration.days_remaining` | compliance | certification | expiration | days_remaining |
| `ml.prediction.accuracy.percentage` | ml | prediction | accuracy | percentage |

---

## TypeScript Client Example

```typescript
import axios from 'axios';

const INGESTION_URL = 'http://localhost:3000/api/v1/ingest';

interface TelemetryEvent {
  name: string;
  timestamp: string;
  facilityId: string;
  assetId: string;
  environment: string;
  serviceName: string;
  assetCategory: string;
  assetType: string;
  eventCategory: string;
  severity: string;
  value: number;
  unit: string;
  labels?: {
    healthScore?: number;
    healthStatus?: string;
    anomalyDetected?: boolean;
    failureProbability?: number;
  };
}

async function sendTelemetry(event: TelemetryEvent): Promise<void> {
  try {
    const response = await axios.post(`${INGESTION_URL}/telemetry`, event);
    console.log(`Ingested: ${event.name}`, response.data);
  } catch (error) {
    console.error(`Failed to ingest: ${event.name}`, error.response?.data);
  }
}

// Example usage
const event: TelemetryEvent = {
  name: 'asset.ct_scanner.tube_temperature.reading_celsius',
  timestamp: new Date().toISOString(),
  facilityId: '550e8400-e29b-41d4-a716-446655440001',
  assetId: '550e8400-e29b-41d4-a716-446655440004',
  environment: 'production',
  serviceName: 'ct-monitor',
  assetCategory: 'diagnostic_imaging',
  assetType: 'ct_scanner',
  eventCategory: 'operational',
  severity: 'info',
  value: 65.2,
  unit: 'celsius',
  labels: {
    healthScore: 85,
    healthStatus: 'good',
    anomalyDetected: false,
    failureProbability: 0.05
  }
};

sendTelemetry(event);
```

---

## Health Score Calculation

The service automatically calculates health scores based on multiple factors:

```typescript
// Health score components (0-100)
const healthScore = calculateHealthScore({
  operatingHours: 15000,        // Current operating hours
  expectedLifeHours: 50000,     // Expected lifetime
  errorCount24h: 2,             // Errors in last 24 hours
  daysSinceLastPm: 45,          // Days since last PM
  pmIntervalDays: 30,           // PM interval (overdue)
  failureProbability: 0.15      // ML prediction
});
// Result: ~60 (fair condition)
```

---

## Health Status Mapping

| Health Score | Status | Action Required |
|--------------|--------|-----------------|
| 0-20 | critical | Immediate intervention |
| 21-40 | poor | Urgent maintenance |
| 41-60 | fair | Schedule maintenance |
| 61-80 | good | Monitor closely |
| 81-100 | excellent | Normal operation |

---

## Error Handling

### Validation Errors

```json
{
  "statusCode": 400,
  "message": [
    "severity must be one of: critical, high, medium, low, info",
    "healthScore must not be greater than 100"
  ],
  "error": "Bad Request"
}
```

### Partial Batch Failures

```json
{
  "success": false,
  "processed": 8,
  "failed": 2,
  "errors": [
    { "index": 3, "message": "Invalid asset ID" },
    { "index": 7, "message": "Validation failed" }
  ]
}
```

---

## Integration with ML Pipeline

### Exporting Training Data

```sql
-- Export labeled data for ML training
SELECT * FROM export_ml_training_data(
  '2025-01-01'::DATE,
  '2025-11-18'::DATE,
  ARRAY['infusion_pump', 'ventilator']
);
```

### Querying Asset Health

```sql
-- Get current health for an asset
SELECT * FROM get_asset_health('550e8400-e29b-41d4-a716-446655440002');

-- Get metrics summary for time range
SELECT * FROM get_asset_metrics_summary(
  '550e8400-e29b-41d4-a716-446655440002',
  NOW() - INTERVAL '7 days',
  NOW()
);
```

---

## Performance Considerations

1. **Batch Size**: Recommended 100-500 events per batch
2. **Compression**: Data older than 7 days is automatically compressed
3. **Retention**: Telemetry data retained for 90 days by default
4. **Continuous Aggregates**: Use `asset_telemetry_hourly` for dashboard queries

---

## Next Steps

1. Configure environment variables for database connection
2. Run database migrations
3. Set up message queue (Redis/RabbitMQ) for async ingestion
4. Implement rate limiting for high-volume sources
5. Add authentication middleware
