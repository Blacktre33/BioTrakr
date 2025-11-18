# BioTrakr Telemetry Labeling Guide

## Overview

This guide establishes standards for naming conventions, ML training labels, and categorization schemas for BioTrakr's telemetry data pipeline. Consistent labeling ensures data quality, enables effective ML model training, and supports compliance/audit requirements.

---

## 1. Naming Conventions

### 1.1 Metric Naming Pattern

Use a hierarchical, dot-separated naming convention:

```
{domain}.{entity}.{action}.{metric_type}
```

**Examples:**
- `asset.infusion_pump.location.update_latency_ms`
- `maintenance.work_order.created.count`
- `rtls.beacon.signal.strength_dbm`
- `compliance.certification.expiration.days_remaining`

### 1.2 Standard Domains

| Domain | Description | Examples |
|--------|-------------|----------|
| `asset` | Asset lifecycle and state | `asset.ventilator.status.changed` |
| `rtls` | Real-time location tracking | `rtls.tag.position.updated` |
| `maintenance` | PM and repairs | `maintenance.pm.completed.count` |
| `compliance` | Regulatory tracking | `compliance.inspection.overdue.count` |
| `user` | User interactions | `user.search.executed.duration_ms` |
| `system` | Infrastructure health | `system.api.request.latency_ms` |
| `ml` | Model performance | `ml.prediction.accuracy.percentage` |

### 1.3 Tag/Label Key Naming

Use snake_case for all tag keys:

```
asset_id
facility_id
department_id
asset_type
manufacturer
model_number
severity_level
event_source
```

### 1.4 Reserved Tags (Always Include)

Every telemetry event should include these standard tags:

```json
{
  "timestamp": "2025-11-07T14:32:00.000Z",
  "facility_id": "facility_001",
  "environment": "production",
  "service_name": "rtls-service",
  "version": "1.2.3",
  "trace_id": "abc123..."
}
```

---

## 2. ML Training Data Labels

### 2.1 Predictive Maintenance Labels

#### Failure Event Labels

```python
class FailureType(Enum):
    NONE = "no_failure"
    MECHANICAL = "mechanical_failure"
    ELECTRICAL = "electrical_failure"
    SOFTWARE = "software_failure"
    CALIBRATION = "calibration_drift"
    WEAR = "component_wear"
    UNKNOWN = "unknown_failure"
```

#### Time-to-Failure Labels (for survival analysis)

```python
class TimeToFailure(Enum):
    IMMINENT = "0-24h"      # Immediate attention
    SOON = "1-7d"           # Schedule this week
    UPCOMING = "7-30d"      # Plan maintenance
    DISTANT = "30d+"        # Normal operation
```

#### Equipment Health Score Labels

```python
# Continuous score 0-100, or categorical:

class HealthStatus(Enum):
    CRITICAL = "critical"     # 0-20: Immediate intervention
    POOR = "poor"             # 21-40: Urgent maintenance
    FAIR = "fair"             # 41-60: Schedule maintenance
    GOOD = "good"             # 61-80: Monitor closely
    EXCELLENT = "excellent"   # 81-100: Normal operation
```

### 2.2 Training Data Schema

#### Sensor Reading Record

```json
{
  "record_id": "uuid",
  "asset_id": "asset_12345",
  "timestamp": "2025-11-07T14:32:00.000Z",
  
  "features": {
    "temperature_celsius": 37.2,
    "vibration_rms": 0.45,
    "power_consumption_watts": 120.5,
    "operating_hours": 15234,
    "cycles_since_maintenance": 450,
    "error_count_24h": 2,
    "ambient_humidity_percent": 45.0
  },
  
  "labels": {
    "failure_within_7d": true,
    "failure_type": "mechanical_failure",
    "time_to_failure_hours": 142,
    "health_score": 35,
    "health_status": "poor",
    "requires_pm": true,
    "anomaly_detected": true
  },
  
  "metadata": {
    "label_source": "historical_maintenance_log",
    "label_confidence": 0.95,
    "labeled_by": "automated_pipeline",
    "labeled_at": "2025-11-07T15:00:00.000Z"
  }
}
```

### 2.3 Labeling Sources

| Source | Use Case | Confidence |
|--------|----------|------------|
| Maintenance logs | Failure events, repair types | High |
| Work orders | PM completion, parts replaced | High |
| Manufacturer specs | Expected lifespans, thresholds | Medium |
| Technician annotations | Root cause analysis | High |
| Automated detection | Anomaly flags, threshold breaches | Medium |
| Synthetic augmentation | Edge cases, rare failures | Low-Medium |

### 2.4 Label Quality Tags

Always track label provenance:

```python
class LabelQuality(Enum):
    VERIFIED = "verified"           # Human-confirmed
    AUTOMATED = "automated"         # System-generated
    INFERRED = "inferred"           # Derived from related data
    ESTIMATED = "estimated"         # Based on models/heuristics
    SYNTHETIC = "synthetic"         # Artificially generated
```

---

## 3. Categorization Schemas

### 3.1 Asset Categories

#### Primary Classification

```yaml
asset_categories:
  diagnostic_imaging:
    - ct_scanner
    - mri_system
    - xray_unit
    - ultrasound
    - mammography
    
  life_support:
    - ventilator
    - infusion_pump
    - patient_monitor
    - defibrillator
    
  surgical:
    - surgical_robot
    - electrosurgical_unit
    - anesthesia_machine
    
  laboratory:
    - analyzer
    - centrifuge
    - microscope
    
  patient_care:
    - hospital_bed
    - wheelchair
    - stretcher
    
  infrastructure:
    - hvac_unit
    - generator
    - ups_system
```

#### Risk Classification (FDA-aligned)

```python
class RiskClass(Enum):
    CLASS_I = "class_i"       # Low risk
    CLASS_II = "class_ii"     # Moderate risk
    CLASS_III = "class_iii"   # High risk
```

### 3.2 Event Categories

#### Event Type Hierarchy

```yaml
event_categories:
  location:
    - position_update
    - zone_entry
    - zone_exit
    - geofence_breach
    
  maintenance:
    - pm_scheduled
    - pm_completed
    - pm_overdue
    - repair_requested
    - repair_completed
    
  compliance:
    - certification_expiring
    - certification_expired
    - inspection_due
    - inspection_completed
    - recall_issued
    
  operational:
    - powered_on
    - powered_off
    - error_occurred
    - calibration_needed
    - utilization_threshold
    
  system:
    - service_started
    - service_stopped
    - config_changed
    - deployment_completed
```

#### Severity Levels

```python
class Severity(Enum):
    CRITICAL = "critical"   # Immediate action required
    HIGH = "high"           # Action within 4 hours
    MEDIUM = "medium"       # Action within 24 hours
    LOW = "low"             # Action within 7 days
    INFO = "info"           # No action required
```

### 3.3 Compliance Categories

```yaml
compliance_categories:
  regulatory_body:
    - fda
    - joint_commission
    - state_health_dept
    - cms
    - osha
    
  document_type:
    - certification
    - inspection_report
    - calibration_record
    - maintenance_log
    - incident_report
    - recall_notice
    
  compliance_status:
    - compliant
    - non_compliant
    - pending_review
    - remediation_in_progress
    - exemption_granted
```

### 3.4 Department/Location Categories

```yaml
location_categories:
  clinical_areas:
    - emergency_department
    - intensive_care_unit
    - operating_room
    - radiology
    - laboratory
    - pharmacy
    - patient_room
    
  support_areas:
    - biomedical_engineering
    - central_sterile
    - materials_management
    - loading_dock
    
  zone_types:
    - sterile_zone
    - clean_zone
    - general_zone
    - restricted_zone
```

---

## 4. Implementation Examples

### 4.1 TimescaleDB Schema for Telemetry

```sql
-- Hypertable for time-series telemetry
CREATE TABLE asset_telemetry (
    time TIMESTAMPTZ NOT NULL,
    asset_id TEXT NOT NULL,
    facility_id TEXT NOT NULL,
    
    -- Categorization
    asset_category TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    department TEXT,
    risk_class TEXT,
    
    -- Measurements
    metric_name TEXT NOT NULL,
    metric_value DOUBLE PRECISION,
    metric_unit TEXT,
    
    -- ML Labels (nullable - populated by labeling pipeline)
    health_score INTEGER,
    health_status TEXT,
    anomaly_detected BOOLEAN,
    failure_probability DOUBLE PRECISION,
    
    -- Metadata
    event_source TEXT,
    trace_id TEXT
);

SELECT create_hypertable('asset_telemetry', 'time');

-- Indexes for common queries
CREATE INDEX idx_asset_telemetry_asset ON asset_telemetry (asset_id, time DESC);
CREATE INDEX idx_asset_telemetry_category ON asset_telemetry (asset_category, time DESC);
CREATE INDEX idx_asset_telemetry_health ON asset_telemetry (health_status, time DESC);
```

### 4.2 Event Emission Example (TypeScript)

```typescript
interface TelemetryEvent {
  // Naming convention: domain.entity.action.metric_type
  name: string;
  
  // Standard tags
  timestamp: string;
  facility_id: string;
  asset_id: string;
  environment: string;
  service_name: string;
  trace_id: string;
  
  // Categorization
  asset_category: string;
  asset_type: string;
  department: string;
  event_category: string;
  severity: string;
  
  // Measurement
  value: number;
  unit: string;
  
  // ML labels (optional)
  labels?: {
    health_score?: number;
    health_status?: string;
    anomaly_detected?: boolean;
    failure_probability?: number;
  };
}

// Example usage
const event: TelemetryEvent = {
  name: "asset.infusion_pump.temperature.reading_celsius",
  timestamp: new Date().toISOString(),
  facility_id: "facility_001",
  asset_id: "pump_12345",
  environment: "production",
  service_name: "iot-collector",
  trace_id: generateTraceId(),
  
  asset_category: "life_support",
  asset_type: "infusion_pump",
  department: "intensive_care_unit",
  event_category: "operational",
  severity: "info",
  
  value: 38.5,
  unit: "celsius",
  
  labels: {
    health_score: 72,
    health_status: "good",
    anomaly_detected: false,
    failure_probability: 0.08
  }
};
```

### 4.3 ML Training Data Export Query

```sql
-- Export labeled training data for predictive maintenance
SELECT 
    t.time,
    t.asset_id,
    t.asset_type,
    t.asset_category,
    
    -- Features
    MAX(CASE WHEN t.metric_name = 'temperature' THEN t.metric_value END) as temperature,
    MAX(CASE WHEN t.metric_name = 'vibration' THEN t.metric_value END) as vibration,
    MAX(CASE WHEN t.metric_name = 'power_consumption' THEN t.metric_value END) as power,
    
    -- Labels from maintenance events
    CASE 
        WHEN m.failure_date IS NOT NULL 
             AND m.failure_date BETWEEN t.time AND t.time + INTERVAL '7 days'
        THEN true 
        ELSE false 
    END as failure_within_7d,
    
    m.failure_type,
    EXTRACT(EPOCH FROM (m.failure_date - t.time))/3600 as hours_to_failure
    
FROM asset_telemetry t
LEFT JOIN maintenance_events m ON t.asset_id = m.asset_id
WHERE t.time >= '2024-01-01'
GROUP BY t.time, t.asset_id, t.asset_type, t.asset_category, 
         m.failure_date, m.failure_type
ORDER BY t.time;
```

---

## 5. Validation Rules

### 5.1 Required Fields by Event Type

```yaml
validation_rules:
  all_events:
    required:
      - timestamp
      - facility_id
      - service_name
      - event_category
      
  asset_events:
    required:
      - asset_id
      - asset_category
      - asset_type
      
  ml_labeled_events:
    required:
      - label_source
      - label_confidence
    constraints:
      - health_score: 0-100
      - failure_probability: 0.0-1.0
```

### 5.2 Enum Validation

Validate all categorical fields against defined enums to prevent data quality issues:

```typescript
const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const VALID_HEALTH_STATUSES = ['critical', 'poor', 'fair', 'good', 'excellent'];
const VALID_RISK_CLASSES = ['class_i', 'class_ii', 'class_iii'];

function validateEvent(event: TelemetryEvent): ValidationResult {
  const errors: string[] = [];
  
  if (!VALID_SEVERITIES.includes(event.severity)) {
    errors.push(`Invalid severity: ${event.severity}`);
  }
  
  if (event.labels?.health_status && 
      !VALID_HEALTH_STATUSES.includes(event.labels.health_status)) {
    errors.push(`Invalid health_status: ${event.labels.health_status}`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

---

## 6. Best Practices

### 6.1 Naming

- Use lowercase with underscores for tag keys
- Use dots for metric name hierarchy
- Be specific but concise
- Include units in metric names when not obvious
- Avoid abbreviations unless universally understood

### 6.2 ML Labels

- Always track label provenance (source, confidence, timestamp)
- Use multiple labeling approaches and compare
- Include both categorical and continuous labels where applicable
- Version your labeling schemas
- Document edge cases and labeling decisions

### 6.3 Categorization

- Use controlled vocabularies (enums) not free text
- Align with industry standards (FDA, HL7, etc.)
- Support hierarchical queries (category → type)
- Plan for future categories without breaking changes

### 6.4 Data Quality

- Validate on ingestion, not just query time
- Monitor for label drift over time
- Regular audits of categorical distributions
- Automated alerts for validation failures

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-07 | Initial release |

