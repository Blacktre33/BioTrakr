-- =====================================================
-- BioTrakr TimescaleDB-Specific Features
-- Post-Migration Setup Script
-- Version: 2.0
-- Date: November 8, 2025
-- =====================================================
-- 
-- This script should be run AFTER Prisma migrations
-- to enable TimescaleDB-specific features that cannot
-- be expressed in Prisma schema.
--
-- Run with:
-- psql -U postgres -d medasset_dev -f timescaledb-setup.sql
-- OR
-- pnpm prisma db execute --file prisma/migrations/timescaledb-setup.sql
--
-- =====================================================

-- =====================================================
-- ENABLE TIMESCALEDB EXTENSION
-- =====================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- =====================================================
-- PREPARE TABLES FOR HYPERTABLES
-- =====================================================

-- Drop existing primary key constraints and recreate with timestamp
ALTER TABLE location_history DROP CONSTRAINT IF EXISTS location_history_pkey;
ALTER TABLE location_history ADD PRIMARY KEY ("assetId", timestamp);

ALTER TABLE usage_logs DROP CONSTRAINT IF EXISTS usage_logs_pkey;
ALTER TABLE usage_logs ADD PRIMARY KEY ("assetId", "sessionStartTime");

ALTER TABLE iot_sensor_readings DROP CONSTRAINT IF EXISTS iot_sensor_readings_pkey;
ALTER TABLE iot_sensor_readings ADD PRIMARY KEY ("sensorId", timestamp);

ALTER TABLE predictive_scores_history DROP CONSTRAINT IF EXISTS predictive_scores_history_pkey;
ALTER TABLE predictive_scores_history ADD PRIMARY KEY ("assetId", timestamp);

-- =====================================================
-- CONVERT TABLES TO HYPERTABLES
-- =====================================================

-- Location History (High-volume time-series data)
SELECT create_hypertable(
    'location_history',
    'timestamp',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE,
    migrate_data => TRUE
);

-- Usage Logs (Session-based time-series)
SELECT create_hypertable(
    'usage_logs',
    'sessionStartTime',
    chunk_time_interval => INTERVAL '30 days',
    if_not_exists => TRUE,
    migrate_data => TRUE
);

-- IoT Sensor Readings (High-frequency time-series)
SELECT create_hypertable(
    'iot_sensor_readings',
    'timestamp',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE,
    migrate_data => TRUE
);

-- Predictive Scores History (ML predictions over time)
SELECT create_hypertable(
    'predictive_scores_history',
    'timestamp',
    chunk_time_interval => INTERVAL '30 days',
    if_not_exists => TRUE,
    migrate_data => TRUE
);

-- =====================================================
-- ENABLE COMPRESSION ON HYPERTABLES
-- =====================================================

ALTER TABLE location_history SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'timestamp DESC',
    timescaledb.compress_segmentby = '"assetId"'
);

ALTER TABLE iot_sensor_readings SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'timestamp DESC',
    timescaledb.compress_segmentby = '"sensorId"'
);

ALTER TABLE usage_logs SET (
    timescaledb.compress,
    timescaledb.compress_orderby = '"sessionStartTime" DESC',
    timescaledb.compress_segmentby = '"assetId"'
);

-- =====================================================
-- ADD COMPRESSION POLICIES
-- =====================================================

-- Compress location_history data older than 30 days
SELECT add_compression_policy(
    'location_history',
    INTERVAL '30 days',
    if_not_exists => TRUE
);

-- Compress IoT sensor readings older than 90 days
SELECT add_compression_policy(
    'iot_sensor_readings',
    INTERVAL '90 days',
    if_not_exists => TRUE
);

-- Compress usage logs older than 180 days
SELECT add_compression_policy(
    'usage_logs',
    INTERVAL '180 days',
    if_not_exists => TRUE
);

-- =====================================================
-- ADD DATA RETENTION POLICIES
-- =====================================================

-- Automatically drop location_history chunks older than 2 years
SELECT add_retention_policy(
    'location_history',
    INTERVAL '2 years',
    if_not_exists => TRUE
);

-- Keep IoT sensor readings for 3 years
SELECT add_retention_policy(
    'iot_sensor_readings',
    INTERVAL '3 years',
    if_not_exists => TRUE
);

-- Keep usage logs for 5 years (compliance)
SELECT add_retention_policy(
    'usage_logs',
    INTERVAL '5 years',
    if_not_exists => TRUE
);

-- =====================================================
-- CREATE CONTINUOUS AGGREGATES
-- =====================================================

-- Hourly location update aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS location_history_hourly
WITH (timescaledb.continuous) AS
SELECT 
    "assetId",
    time_bucket('1 hour', timestamp) AS hour,
    COUNT(*) AS location_updates,
    AVG("accuracyMeters") AS avg_accuracy,
    MAX("signalStrength") AS max_signal_strength
FROM location_history
GROUP BY "assetId", hour
WITH NO DATA;

-- Add refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy(
    'location_history_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Daily usage statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS usage_logs_daily
WITH (timescaledb.continuous) AS
SELECT 
    "assetId",
    time_bucket('1 day', "sessionStartTime") AS day,
    COUNT(*) AS session_count,
    SUM("durationMinutes") AS total_minutes,
    AVG("durationMinutes") AS avg_session_duration,
    COUNT(DISTINCT "operatorId") AS unique_operators
FROM usage_logs
WHERE "sessionEndTime" IS NOT NULL
GROUP BY "assetId", day
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'usage_logs_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- =====================================================
-- CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to calculate current book value
CREATE OR REPLACE FUNCTION calculate_current_book_value(
    p_purchase_cost DECIMAL,
    p_purchase_date DATE,
    p_depreciation_method TEXT,
    p_useful_life_years INTEGER,
    p_salvage_value DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
    v_years_elapsed DECIMAL;
    v_depreciable_amount DECIMAL;
    v_annual_depreciation DECIMAL;
    v_book_value DECIMAL;
BEGIN
    v_years_elapsed := EXTRACT(EPOCH FROM (CURRENT_DATE - p_purchase_date)) / (365.25 * 24 * 60 * 60);
    v_depreciable_amount := p_purchase_cost - COALESCE(p_salvage_value, 0);
    
    IF p_depreciation_method = 'STRAIGHT_LINE' THEN
        v_annual_depreciation := v_depreciable_amount / p_useful_life_years;
        v_book_value := p_purchase_cost - (v_annual_depreciation * v_years_elapsed);
    ELSIF p_depreciation_method = 'DECLINING_BALANCE' THEN
        v_book_value := p_purchase_cost * POWER((1 - (1.0 / p_useful_life_years)), v_years_elapsed);
    ELSIF p_depreciation_method = 'DOUBLE_DECLINING' THEN
        v_book_value := p_purchase_cost * POWER((1 - (2.0 / p_useful_life_years)), v_years_elapsed);
    ELSE
        -- Default to straight line
        v_annual_depreciation := v_depreciable_amount / p_useful_life_years;
        v_book_value := p_purchase_cost - (v_annual_depreciation * v_years_elapsed);
    END IF;
    
    -- Ensure book value doesn't go below salvage value
    IF v_book_value < COALESCE(p_salvage_value, 0) THEN
        v_book_value := COALESCE(p_salvage_value, 0);
    END IF;
    
    RETURN v_book_value;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- CREATE TRIGGERS
-- =====================================================

-- Auto-update PM compliance status trigger
CREATE OR REPLACE FUNCTION update_pm_compliance_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."nextPmDueDate" IS NOT NULL THEN
        IF CURRENT_DATE > NEW."nextPmDueDate" + INTERVAL '30 days' THEN
            NEW."pmComplianceStatus" := 'CRITICAL';
        ELSIF CURRENT_DATE > NEW."nextPmDueDate" THEN
            NEW."pmComplianceStatus" := 'OVERDUE';
        ELSIF CURRENT_DATE > NEW."nextPmDueDate" - INTERVAL '7 days' THEN
            NEW."pmComplianceStatus" := 'GRACE_PERIOD';
        ELSE
            NEW."pmComplianceStatus" := 'COMPLIANT';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_pm_compliance_status ON assets;
CREATE TRIGGER set_pm_compliance_status 
    BEFORE INSERT OR UPDATE OF "nextPmDueDate" ON assets
    FOR EACH ROW 
    EXECUTE FUNCTION update_pm_compliance_status();

-- Auto-update asset version for optimistic locking
CREATE OR REPLACE FUNCTION increment_asset_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version := OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS increment_version_on_update ON assets;
CREATE TRIGGER increment_version_on_update
    BEFORE UPDATE ON assets
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)
    EXECUTE FUNCTION increment_asset_version();

-- =====================================================
-- CREATE USEFUL VIEWS
-- =====================================================

-- Active assets with current location
CREATE OR REPLACE VIEW v_active_assets_with_location AS
SELECT 
    a.id,
    a."assetTagNumber",
    a."equipmentName",
    a."modelNumber",
    a."serialNumber",
    a."assetStatus",
    a."criticalityLevel",
    f."facilityName",
    b."buildingName",
    fl."floorName",
    r."roomName",
    a."lastSeenTimestamp",
    a."currentCoordinatesX",
    a."currentCoordinatesY",
    a."currentCoordinatesZ"
FROM assets a
LEFT JOIN facilities f ON a."currentFacilityId" = f.id
LEFT JOIN buildings b ON a."currentBuildingId" = b.id
LEFT JOIN floors fl ON a."currentFloorId" = fl.id
LEFT JOIN rooms r ON a."currentRoomId" = r.id
WHERE a."deletedAt" IS NULL 
  AND a."assetStatus" IN ('ACTIVE', 'IN_SERVICE');

-- Overdue maintenance view
CREATE OR REPLACE VIEW v_overdue_maintenance AS
SELECT 
    a.id,
    a."assetTagNumber",
    a."equipmentName",
    a."nextPmDueDate",
    CURRENT_DATE - a."nextPmDueDate" AS days_overdue,
    a."criticalityLevel",
    u."firstName" || ' ' || u."lastName" AS custodian_name,
    u.email AS custodian_email,
    d."departmentName"
FROM assets a
JOIN users u ON a."primaryCustodianId" = u.id
JOIN departments d ON a."custodianDepartmentId" = d.id
WHERE a."deletedAt" IS NULL
  AND a."nextPmDueDate" < CURRENT_DATE
  AND a."assetStatus" IN ('ACTIVE', 'IN_SERVICE')
ORDER BY days_overdue DESC;

-- High-risk failure predictions
CREATE OR REPLACE VIEW v_high_risk_assets AS
SELECT 
    a.id,
    a."assetTagNumber",
    a."equipmentName",
    a."failureProbabilityScore",
    a."predictedFailureDate",
    a."failureCategory",
    a."criticalityLevel",
    a."mtbfHours",
    a."lastFailureDate",
    r."roomName" AS current_location
FROM assets a
LEFT JOIN rooms r ON a."currentRoomId" = r.id
WHERE a."deletedAt" IS NULL
  AND a."failureProbabilityScore" >= 70
  AND a."assetStatus" IN ('ACTIVE', 'IN_SERVICE')
ORDER BY a."failureProbabilityScore" DESC, a."criticalityLevel";

-- Asset utilization summary
CREATE OR REPLACE VIEW v_asset_utilization AS
SELECT 
    a.id,
    a."assetTagNumber",
    a."equipmentName",
    a."deviceCategory",
    a."totalUsageHours",
    a."utilizationRatePercent",
    a."idleTimeHoursLast30Days",
    a."lastUsedTimestamp",
    CASE 
        WHEN a."utilizationRatePercent" < 20 THEN 'UNDERUTILIZED'
        WHEN a."utilizationRatePercent" > 80 THEN 'HIGH_DEMAND'
        ELSE 'NORMAL'
    END AS utilization_status
FROM assets a
WHERE a."deletedAt" IS NULL
  AND a."assetStatus" IN ('ACTIVE', 'IN_SERVICE');

-- =====================================================
-- CREATE FULL-TEXT SEARCH INDEXES
-- =====================================================

-- Full-text search on equipment name and model
CREATE INDEX IF NOT EXISTS idx_assets_search ON assets USING GIN (
    to_tsvector('english', "equipmentName" || ' ' || "modelNumber" || ' ' || COALESCE(manufacturer, ''))
);

-- Trigram indexes for fuzzy search
CREATE INDEX IF NOT EXISTS idx_assets_equipment_name_trgm ON assets USING gin ("equipmentName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_assets_model_number_trgm ON assets USING gin ("modelNumber" gin_trgm_ops);

-- =====================================================
-- GRANT PERMISSIONS (Adjust as needed)
-- =====================================================

-- Grant read-only access for reporting (optional)
-- CREATE ROLE biotrakr_readonly;
-- GRANT CONNECT ON DATABASE medasset_dev TO biotrakr_readonly;
-- GRANT USAGE ON SCHEMA public TO biotrakr_readonly;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO biotrakr_readonly;

-- =====================================================
-- VERIFY INSTALLATION
-- =====================================================

-- Check TimescaleDB hypertables
SELECT 
    hypertable_schema,
    hypertable_name,
    num_chunks
FROM timescaledb_information.hypertables;

-- Check compression policies
SELECT 
    hypertable_schema,
    hypertable_name,
    compression_enabled
FROM timescaledb_information.hypertables
WHERE compression_enabled = true;

-- Check continuous aggregates
SELECT 
    view_name,
    materialization_hypertable_name,
    compression_enabled
FROM timescaledb_information.continuous_aggregates;

-- Display success message
SELECT 'BioTrakr TimescaleDB setup completed successfully!' AS status;

