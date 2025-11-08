# BioTrakr Asset Management Database Requirements
## Version 2.0 - Updated November 8, 2025

---

## 🎯 CORE DESIGN PRINCIPLES

1. **RTLS-First Architecture** – Real-time location is a primary feature, not an afterthought
2. **ML-Ready Data Model** – Time-series data optimized for predictive analytics
3. **Compliance-Native** – Regulatory requirements baked into schema
4. **Multi-Tenancy** – Support 50+ facilities from day one
5. **Audit Everything** – Complete traceability for healthcare compliance
6. **API-Friendly** – External system integration as first-class citizen

---

## 📊 DATA DOMAINS

### 1. BASIC IDENTIFICATION & CLASSIFICATION

**Purpose:** Unique identification and categorization of medical assets

| Field Name | Type | Required | Description | Example |
|------------|------|----------|-------------|---------|
| asset_id | UUID | ✅ | Primary key, immutable | `550e8400-e29b-41d4-a716-446655440000` |
| asset_tag_number | VARCHAR(50) | ✅ | Human-readable unique ID | `BME-2024-001234` |
| equipment_name | VARCHAR(200) | ✅ | Common name | `GE Optima MR360` |
| manufacturer | VARCHAR(100) | ✅ | Brand/manufacturer | `General Electric Healthcare` |
| model_number | VARCHAR(100) | ✅ | Model/series | `Optima MR360 1.5T` |
| serial_number | VARCHAR(100) | ✅ | Factory serial number | `SN123456789` |
| device_category | ENUM | ✅ | High-level classification | `IMAGING`, `LABORATORY`, `SURGICAL`, `PATIENT_MONITORING`, `THERAPEUTIC`, `LIFE_SUPPORT` |
| device_subcategory | VARCHAR(100) | ❌ | Specific type | `MRI Scanner`, `Blood Gas Analyzer` |
| udi_device_identifier | VARCHAR(100) | ✅ | FDA UDI-DI | `(01)00643169001763` |
| udi_production_identifier | VARCHAR(100) | ❌ | UDI-PI with lot/serial | `(10)ABC123(21)XYZ789` |
| gmdn_code | VARCHAR(20) | ❌ | Global Medical Device Nomenclature | `40761` |
| asset_status | ENUM | ✅ | Lifecycle state | `ACTIVE`, `IN_SERVICE`, `IN_MAINTENANCE`, `CONDEMNED`, `RETIRED`, `DISPOSED` |
| criticality_level | ENUM | ✅ | Business impact | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |

---

### 2. PROCUREMENT & VENDOR INFORMATION

**Purpose:** Financial tracking and vendor management

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| vendor_id | UUID (FK) | ✅ | Reference to vendors table |
| purchase_order_number | VARCHAR(50) | ❌ | PO reference |
| invoice_number | VARCHAR(50) | ❌ | Invoice reference |
| purchase_date | DATE | ✅ | Date of acquisition |
| installation_date | DATE | ❌ | Date made operational (≠ purchase date) |
| purchase_cost | DECIMAL(12,2) | ✅ | Original cost in local currency |
| currency_code | VARCHAR(3) | ✅ | ISO 4217 code (USD, INR, EUR) |
| funding_source | VARCHAR(100) | ❌ | Grant, budget line, donation |
| grant_number | VARCHAR(50) | ❌ | External funding reference |
| estimated_replacement_cost | DECIMAL(12,2) | ❌ | Current market value |
| residual_value | DECIMAL(12,2) | ❌ | End-of-life salvage value |

---

### 3. WARRANTY & SERVICE CONTRACTS

**Purpose:** Maintenance obligations and vendor support

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| warranty_start_date | DATE | ❌ | Manufacturer warranty begins |
| warranty_end_date | DATE | ❌ | Manufacturer warranty expires |
| warranty_terms | TEXT | ❌ | Coverage details |
| amc_provider_id | UUID (FK) | ❌ | Annual Maintenance Contract vendor |
| amc_contract_number | VARCHAR(50) | ❌ | Contract reference |
| amc_start_date | DATE | ❌ | AMC coverage begins |
| amc_end_date | DATE | ❌ | AMC coverage expires |
| amc_cost_annual | DECIMAL(12,2) | ❌ | Yearly AMC cost |
| cmc_provider_id | UUID (FK) | ❌ | Comprehensive Maintenance Contract vendor |
| service_level_agreement | ENUM | ❌ | Response time SLA: `4_HOURS`, `8_HOURS`, `24_HOURS`, `NEXT_DAY` |

---

### 4. TECHNICAL SPECIFICATIONS

**Purpose:** Operational parameters and configuration

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| technical_specifications | JSONB | ❌ | Key-value pairs: voltage, capacity, dimensions |
| software_version | VARCHAR(50) | ❌ | Embedded software/firmware |
| operating_system | VARCHAR(50) | ❌ | If applicable (e.g., Windows IoT) |
| network_mac_address | VARCHAR(17) | ❌ | For networked devices |
| ip_address | VARCHAR(45) | ❌ | Static/DHCP assigned IP |
| power_requirements | VARCHAR(100) | ❌ | Voltage, phase, current |
| weight_kg | DECIMAL(8,2) | ❌ | Physical weight |
| dimensions_cm | VARCHAR(50) | ❌ | L x W x H |
| requires_calibration | BOOLEAN | ✅ | Does this device need periodic calibration? |
| calibration_frequency_days | INTEGER | ❌ | How often (if applicable) |
| last_calibration_date | DATE | ❌ | Most recent calibration |
| next_calibration_due | DATE | ❌ | Upcoming calibration deadline |
| environmental_requirements | TEXT | ❌ | Temperature, humidity constraints |

---

### 5. REGULATORY & COMPLIANCE

**Purpose:** Audit readiness and regulatory adherence

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| risk_classification | ENUM | ✅ | `CLASS_I`, `CLASS_II`, `CLASS_III` (FDA/IEC 60601) |
| fda_registration_number | VARCHAR(50) | ❌ | FDA establishment registration |
| fda_510k_number | VARCHAR(50) | ❌ | Premarket notification number |
| ce_mark_certificate | VARCHAR(100) | ❌ | CE marking details |
| iso_certification | VARCHAR(100) | ❌ | ISO 13485, etc. |
| recall_status | ENUM | ✅ | `NONE`, `CLASS_I`, `CLASS_II`, `CLASS_III` |
| recall_notice_id | VARCHAR(100) | ❌ | FDA recall reference |
| last_safety_inspection_date | DATE | ❌ | Most recent regulatory inspection |
| next_safety_inspection_due | DATE | ❌ | Upcoming inspection deadline |
| biomedical_waste_handling | ENUM | ❌ | `STANDARD`, `BIOHAZARD`, `RADIOACTIVE`, `CHEMICAL` |
| requires_operator_certification | BOOLEAN | ✅ | Staff must be trained/certified? |
| decontamination_protocol | TEXT | ❌ | Cleaning/sterilization requirements |

---

### 6. PREVENTIVE MAINTENANCE SCHEDULING

**Purpose:** PM compliance and work order generation

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| pm_frequency_days | INTEGER | ❌ | Interval between PM tasks |
| last_pm_date | DATE | ❌ | Most recent preventive maintenance |
| next_pm_due_date | DATE | ❌ | Upcoming PM deadline |
| pm_procedure_document | VARCHAR(255) | ❌ | Link to PM checklist/SOP |
| pm_estimated_duration_hours | DECIMAL(4,1) | ❌ | Typical PM time required |
| auto_generate_work_orders | BOOLEAN | ✅ | Auto-create WOs when PM due? |
| pm_compliance_status | ENUM | ✅ | `COMPLIANT`, `OVERDUE`, `GRACE_PERIOD`, `CRITICAL` |

---

### 7. REAL-TIME LOCATION TRACKING ⭐ CRITICAL

**Purpose:** Sub-room accuracy asset tracking (core BioTrakr differentiator)

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| current_facility_id | UUID (FK) | ✅ | Which facility is it in? |
| current_building_id | UUID (FK) | ❌ | Which building? |
| current_floor_id | UUID (FK) | ❌ | Which floor? |
| current_room_id | UUID (FK) | ❌ | Which room/zone? |
| current_zone | VARCHAR(50) | ❌ | Sub-room zone (e.g., "OR-3-Bay-A") |
| current_coordinates_x | DECIMAL(10,4) | ❌ | X coordinate (meters from origin) |
| current_coordinates_y | DECIMAL(10,4) | ❌ | Y coordinate |
| current_coordinates_z | DECIMAL(10,4) | ❌ | Z coordinate (floor level) |
| location_accuracy_meters | DECIMAL(4,2) | ❌ | Tracking precision |
| last_seen_timestamp | TIMESTAMPTZ | ✅ | Last location update (critical for "lost" alerts) |
| is_moving | BOOLEAN | ✅ | Currently in motion? |
| rfid_tag_id | VARCHAR(50) | ❌ | Primary RFID tag identifier |
| rfid_tag_ids | JSON | ❌ | Multiple tags (array) |
| ble_beacon_mac | VARCHAR(17) | ❌ | Bluetooth beacon MAC address |
| gps_latitude | DECIMAL(10,7) | ❌ | For mobile assets |
| gps_longitude | DECIMAL(10,7) | ❌ | For mobile assets |
| geofence_violations | INTEGER | ✅ | Count of restricted area breaches |
| home_location_id | UUID (FK) | ❌ | Default storage location |

---

### 8. USAGE & UTILIZATION ANALYTICS ⭐ CRITICAL

**Purpose:** ROI measurement and operational efficiency

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| total_usage_hours | DECIMAL(12,2) | ✅ | Lifetime cumulative usage |
| total_usage_cycles | BIGINT | ❌ | For cycle-based devices (e.g., autoclaves) |
| current_assigned_user_id | UUID (FK) | ❌ | Who is using it now? |
| current_assigned_department_id | UUID (FK) | ❌ | Which department? |
| utilization_rate_percent | DECIMAL(5,2) | ❌ | % of available time in use (calculated) |
| idle_time_hours_last_30_days | DECIMAL(8,2) | ❌ | Underutilization metric |
| last_used_timestamp | TIMESTAMPTZ | ❌ | Most recent usage event |
| average_session_duration_minutes | DECIMAL(8,2) | ❌ | Typical usage pattern |
| peak_usage_day_of_week | VARCHAR(10) | ❌ | `MONDAY`, `TUESDAY`, etc. |
| peak_usage_hour_of_day | INTEGER | ❌ | 0-23 (24-hour format) |

---

### 9. PREDICTIVE MAINTENANCE DATA ⭐ CRITICAL

**Purpose:** ML-driven proactive maintenance

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| failure_probability_score | DECIMAL(5,2) | ❌ | 0-100% likelihood of failure (ML output) |
| predicted_failure_date | DATE | ❌ | Estimated failure date |
| failure_category | ENUM | ❌ | `ELECTRICAL`, `MECHANICAL`, `SOFTWARE`, `HYDRAULIC`, `PNEUMATIC` |
| mtbf_hours | DECIMAL(12,2) | ❌ | Mean Time Between Failures |
| mttr_hours | DECIMAL(8,2) | ❌ | Mean Time To Repair |
| failure_count_lifetime | INTEGER | ✅ | Total failures since installation |
| last_failure_date | DATE | ❌ | Most recent breakdown |
| ml_model_version | VARCHAR(50) | ❌ | Which model generated prediction? |
| ml_prediction_confidence | DECIMAL(5,2) | ❌ | Model confidence % |
| ml_last_analyzed_timestamp | TIMESTAMPTZ | ❌ | When was ML last run? |
| iot_sensor_enabled | BOOLEAN | ✅ | Does this device have IoT sensors? |
| iot_sensor_ids | JSON | ❌ | Array of connected sensor IDs |

---

### 10. FINANCIAL & DEPRECIATION

**Purpose:** Total cost of ownership and asset accounting

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| depreciation_method | ENUM | ✅ | `STRAIGHT_LINE`, `DECLINING_BALANCE`, `UNITS_OF_PRODUCTION` |
| useful_life_years | INTEGER | ✅ | Expected lifespan |
| salvage_value | DECIMAL(12,2) | ❌ | End-of-life value |
| current_book_value | DECIMAL(12,2) | ❌ | Calculated current value |
| accumulated_depreciation | DECIMAL(12,2) | ❌ | Total depreciation to date |
| total_maintenance_cost_lifetime | DECIMAL(12,2) | ❌ | Sum of all maintenance expenses |
| total_downtime_hours_lifetime | DECIMAL(12,2) | ❌ | Cumulative unavailable time |
| downtime_cost_per_hour | DECIMAL(10,2) | ❌ | Business impact of unavailability |
| total_cost_of_ownership | DECIMAL(12,2) | ❌ | Purchase + maintenance + downtime costs |
| roi_calculation | DECIMAL(10,2) | ❌ | Return on investment % |

---

### 11. USER ASSIGNMENT & RESPONSIBILITY

**Purpose:** Accountability and custody tracking

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| primary_custodian_id | UUID (FK) | ✅ | Responsible person |
| custodian_department_id | UUID (FK) | ✅ | Owning department |
| current_operator_id | UUID (FK) | ❌ | Active user (real-time) |
| last_operator_id | UUID (FK) | ❌ | Previous user |
| requires_checkout | BOOLEAN | ✅ | Must be checked out before use? |
| checked_out | BOOLEAN | ✅ | Currently checked out? |
| checkout_timestamp | TIMESTAMPTZ | ❌ | When checked out |
| expected_return_timestamp | TIMESTAMPTZ | ❌ | When due back |

---

### 12. INTEGRATION & INTEROPERABILITY

**Purpose:** External system synchronization

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| ehr_system_asset_id | VARCHAR(100) | ❌ | Electronic Health Record system ID |
| cmms_platform_asset_id | VARCHAR(100) | ❌ | CMMS (Computerized Maintenance Management) ID |
| financial_system_asset_id | VARCHAR(100) | ❌ | ERP/Accounting system ID |
| hl7_fhir_resource_id | VARCHAR(100) | ❌ | FHIR Device resource ID |
| external_system_urls | JSON | ❌ | Links to external records |
| last_ehr_sync_timestamp | TIMESTAMPTZ | ❌ | Last successful sync |
| last_cmms_sync_timestamp | TIMESTAMPTZ | ❌ | Last successful sync |
| sync_status | ENUM | ✅ | `SYNCED`, `PENDING`, `FAILED`, `NOT_CONFIGURED` |

---

### 13. ALERT CONFIGURATION

**Purpose:** Proactive notification rules

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| pm_alert_days_before | INTEGER | ✅ | Days before PM due to alert |
| calibration_alert_days_before | INTEGER | ❌ | Days before calibration due |
| warranty_expiry_alert_days | INTEGER | ❌ | Days before warranty expires |
| geofence_alert_enabled | BOOLEAN | ✅ | Alert on restricted area entry? |
| idle_alert_threshold_days | INTEGER | ❌ | Alert if unused for X days |
| alert_recipients | JSON | ❌ | Array of user IDs or roles |
| escalation_enabled | BOOLEAN | ✅ | Auto-escalate unacknowledged alerts? |
| escalation_delay_hours | INTEGER | ❌ | Hours before escalation |

---

### 14. MEDIA & DOCUMENTATION

**Purpose:** Digital asset management

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| photo_url | VARCHAR(255) | ❌ | Primary equipment photo |
| installation_photo_urls | JSON | ❌ | Array of installation photos |
| damage_photo_urls | JSON | ❌ | Array of damage/incident photos |
| manual_document_url | VARCHAR(255) | ❌ | Operating manual link |
| service_manual_url | VARCHAR(255) | ❌ | Service/repair manual |
| training_video_urls | JSON | ❌ | Training materials |
| qr_code_image_url | VARCHAR(255) | ❌ | Generated QR code |
| attachment_storage_path | VARCHAR(255) | ❌ | S3/blob storage prefix |

---

### 15. LIFECYCLE METADATA

**Purpose:** Audit trail and data governance

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| created_at | TIMESTAMPTZ | ✅ | Record creation timestamp |
| created_by_user_id | UUID (FK) | ✅ | Who created this record? |
| updated_at | TIMESTAMPTZ | ✅ | Last modification timestamp |
| updated_by_user_id | UUID (FK) | ✅ | Who last modified? |
| deleted_at | TIMESTAMPTZ | ❌ | Soft delete timestamp |
| deleted_by_user_id | UUID (FK) | ❌ | Who deleted? |
| version | INTEGER | ✅ | Optimistic locking version |
| notes | TEXT | ❌ | General remarks/comments |

---

## 🔗 RELATED MODELS (1:MANY RELATIONSHIPS)

### Supporting Models Required:

1. **LocationHistory** – Time-series location tracking (TimescaleDB optimized)
2. **UsageLog** – Per-session usage telemetry
3. **MaintenanceHistory** – Service records and work orders
4. **ComplianceEvent** – Inspections, audits, certifications
5. **AlertHistory** – Notification tracking
6. **AssignmentHistory** – Custody chain
7. **TransferHistory** – Inter-facility moves
8. **PredictiveScoreHistory** – ML prediction time-series
9. **IoTSensorReading** – Environmental sensor data (TimescaleDB optimized)
10. **MediaAttachment** – File metadata
11. **SparePartUsage** – Parts consumed during repairs
12. **TrainingRecord** – Operator certification tracking
13. **AssetRelationship** – Parent-child asset dependencies

---

## 📐 MASTER DATA MODELS

These models contain lookup/reference data:

1. **Facility** – Hospital/clinic locations
2. **Building** – Physical structures
3. **Floor** – Building levels
4. **Room** – Individual rooms/zones with floor plans
5. **Department** – Organizational units
6. **User** – Staff, engineers, administrators
7. **Vendor** – Suppliers and service providers
8. **Organization** – Multi-tenant organizations
9. **MLModel** – Predictive model registry

---

## ✅ SCHEMA DESIGN DECISIONS

### Chosen Technologies:
- **Primary Database:** PostgreSQL 15+
- **ORM:** Prisma 5+
- **Time-Series Optimization:** TimescaleDB for location_history and iot_sensor_readings
- **JSON Storage:** Prisma Json type for flexible attributes and arrays
- **Full-Text Search:** PostgreSQL native FTS for equipment search

### Design Patterns:
- **Soft Deletes:** Use deletedAt instead of hard deletes
- **Audit Columns:** createdAt, createdBy, updatedAt, updatedBy on all models
- **Optimistic Locking:** Version field to prevent concurrent update conflicts
- **Foreign Key Constraints:** Enforced by Prisma
- **Indexes:** Strategic indexes on foreign keys, timestamps, and query-heavy columns

---

## 🎯 SUCCESS CRITERIA

This schema must enable:

✅ Sub-room location accuracy (<5m)  
✅ Real-time location updates (<5 seconds)  
✅ Asset utilization rate calculations  
✅ Predictive maintenance scoring  
✅ Audit-ready compliance reports  
✅ Multi-facility scalability (50+ sites)  
✅ EHR/CMMS integration via foreign IDs  
✅ Total cost of ownership tracking  
✅ Automated alert generation  
✅ 10+ year data retention  

---

**Document Version:** 2.0  
**Last Updated:** November 8, 2025  
**Next Review:** After Phase 1 schema implementation

