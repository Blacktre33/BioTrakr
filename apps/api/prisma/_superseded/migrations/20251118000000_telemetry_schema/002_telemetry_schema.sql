-- BioTrakr Telemetry Schema
-- Migration: 002_telemetry_schema.sql
-- Description: TimescaleDB hypertables for time-series telemetry data

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================================
-- TELEMETRY ENUMS
-- ============================================================================

CREATE TYPE event_severity AS ENUM (
    'critical',
    'high',
    'medium',
    'low',
    'info'
);

CREATE TYPE health_status AS ENUM (
    'critical',
    'poor',
    'fair',
    'good',
    'excellent'
);

CREATE TYPE label_source AS ENUM (
    'verified',
    'automated',
    'inferred',
    'estimated',
    'synthetic'
);

CREATE TYPE failure_type AS ENUM (
    'no_failure',
    'mechanical_failure',
    'electrical_failure',
    'software_failure',
    'calibration_drift',
    'component_wear',
    'unknown_failure'
);

-- ============================================================================
-- CORE TELEMETRY TABLE
-- ============================================================================

CREATE TABLE asset_telemetry (
    time TIMESTAMPTZ NOT NULL,
    asset_id UUID NOT NULL,
    facility_id UUID NOT NULL,
    
    -- Categorization (from labeling guide)
    asset_category VARCHAR(50) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    department VARCHAR(100),
    risk_class VARCHAR(20),
    
    -- Metric identification
    metric_name VARCHAR(255) NOT NULL,
    metric_value DOUBLE PRECISION,
    metric_unit VARCHAR(50),
    
    -- Event metadata
    event_category VARCHAR(50) NOT NULL,
    event_source VARCHAR(50) NOT NULL,
    severity event_severity DEFAULT 'info',
    
    -- ML Labels (populated by labeling pipeline)
    health_score INTEGER CHECK (health_score >= 0 AND health_score <= 100),
    health_status health_status,
    anomaly_detected BOOLEAN,
    failure_probability DOUBLE PRECISION CHECK (failure_probability >= 0 AND failure_probability <= 1),
    predicted_failure_type failure_type,
    time_to_failure_hours DOUBLE PRECISION,
    
    -- Label metadata
    label_source label_source,
    label_confidence DOUBLE PRECISION CHECK (label_confidence >= 0 AND label_confidence <= 1),
    model_version VARCHAR(50),
    
    -- Tracing
    trace_id VARCHAR(100),
    service_name VARCHAR(100),
    
    -- Raw data
    raw_payload JSONB
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('asset_telemetry', 'time', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Enable compression for older data
ALTER TABLE asset_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'asset_id,facility_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- Automatically compress chunks older than 7 days
SELECT add_compression_policy('asset_telemetry', INTERVAL '7 days', if_not_exists => TRUE);

-- ============================================================================
-- RTLS LOCATION EVENTS
-- ============================================================================

CREATE TABLE rtls_events (
    time TIMESTAMPTZ NOT NULL,
    asset_id UUID NOT NULL,
    facility_id UUID NOT NULL,
    
    -- Location data
    location_id UUID,
    zone_id VARCHAR(100),
    floor VARCHAR(50),
    building VARCHAR(100),
    
    -- Coordinates
    x_coordinate DOUBLE PRECISION,
    y_coordinate DOUBLE PRECISION,
    z_coordinate DOUBLE PRECISION,
    
    -- Signal data
    signal_strength_dbm DOUBLE PRECISION,
    confidence DOUBLE PRECISION CHECK (confidence >= 0 AND confidence <= 1),
    accuracy_meters DOUBLE PRECISION,
    
    -- Source
    tag_id VARCHAR(100),
    reader_id VARCHAR(100),
    source_type VARCHAR(20), -- 'rfid', 'ble', 'wifi', 'gps'
    
    -- Event type
    event_type VARCHAR(50), -- 'position_update', 'zone_entry', 'zone_exit', 'geofence_breach'
    
    -- Metadata
    raw_payload JSONB
);

SELECT create_hypertable('rtls_events', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

ALTER TABLE rtls_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'asset_id,facility_id',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('rtls_events', INTERVAL '7 days', if_not_exists => TRUE);

-- ============================================================================
-- MAINTENANCE EVENTS
-- ============================================================================

CREATE TABLE maintenance_events (
    time TIMESTAMPTZ NOT NULL,
    asset_id UUID NOT NULL,
    facility_id UUID NOT NULL,
    work_order_id UUID,
    
    -- Event details
    event_type VARCHAR(50) NOT NULL, -- 'pm_scheduled', 'pm_completed', 'repair_started', etc.
    maintenance_type VARCHAR(50),
    
    -- Failure data (for ML training)
    failure_occurred BOOLEAN DEFAULT false,
    failure_type failure_type,
    failure_code VARCHAR(50),
    root_cause TEXT,
    
    -- Resolution
    parts_replaced JSONB,
    labor_hours DOUBLE PRECISION,
    downtime_hours DOUBLE PRECISION,
    cost DOUBLE PRECISION,
    
    -- Personnel
    technician_id UUID,
    
    -- Notes
    notes TEXT,
    
    -- Metadata
    raw_payload JSONB
);

SELECT create_hypertable('maintenance_events', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- ============================================================================
-- ERROR EVENTS
-- ============================================================================

CREATE TABLE error_events (
    time TIMESTAMPTZ NOT NULL,
    asset_id UUID NOT NULL,
    facility_id UUID NOT NULL,
    
    -- Error details
    error_code VARCHAR(50) NOT NULL,
    error_message TEXT,
    error_category VARCHAR(100),
    severity event_severity NOT NULL,
    
    -- Context
    component VARCHAR(100),
    operation VARCHAR(100),
    
    -- State at time of error
    sensor_readings JSONB,
    
    -- Resolution
    auto_recovered BOOLEAN DEFAULT false,
    requires_intervention BOOLEAN DEFAULT false,
    
    -- Metadata
    raw_payload JSONB
);

SELECT create_hypertable('error_events', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ============================================================================
-- AGGREGATED METRICS (Continuous Aggregates)
-- ============================================================================

-- Hourly aggregates for dashboard queries
CREATE MATERIALIZED VIEW asset_telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    asset_id,
    facility_id,
    asset_type,
    metric_name,
    AVG(metric_value) AS avg_value,
    MIN(metric_value) AS min_value,
    MAX(metric_value) AS max_value,
    STDDEV(metric_value) AS stddev_value,
    COUNT(*) AS sample_count,
    AVG(health_score) AS avg_health_score,
    COUNT(*) FILTER (WHERE anomaly_detected = true) AS anomaly_count
FROM asset_telemetry
GROUP BY bucket, asset_id, facility_id, asset_type, metric_name
WITH NO DATA;

SELECT add_continuous_aggregate_policy('asset_telemetry_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Daily aggregates for analytics
CREATE MATERIALIZED VIEW asset_telemetry_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    asset_id,
    facility_id,
    asset_type,
    metric_name,
    AVG(metric_value) AS avg_value,
    MIN(metric_value) AS min_value,
    MAX(metric_value) AS max_value,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value) AS median_value,
    COUNT(*) AS sample_count,
    AVG(health_score) AS avg_health_score,
    COUNT(*) FILTER (WHERE anomaly_detected = true) AS anomaly_count,
    AVG(failure_probability) AS avg_failure_probability
FROM asset_telemetry
GROUP BY bucket, asset_id, facility_id, asset_type, metric_name
WITH NO DATA;

SELECT add_continuous_aggregate_policy('asset_telemetry_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Asset telemetry
CREATE INDEX idx_telemetry_asset ON asset_telemetry (asset_id, time DESC);
CREATE INDEX idx_telemetry_facility ON asset_telemetry (facility_id, time DESC);
CREATE INDEX idx_telemetry_metric ON asset_telemetry (metric_name, time DESC);
CREATE INDEX idx_telemetry_category ON asset_telemetry (asset_category, time DESC);
CREATE INDEX idx_telemetry_health ON asset_telemetry (health_status, time DESC);
CREATE INDEX idx_telemetry_anomaly ON asset_telemetry (asset_id, time DESC) WHERE anomaly_detected = true;

-- RTLS events
CREATE INDEX idx_rtls_asset ON rtls_events (asset_id, time DESC);
CREATE INDEX idx_rtls_location ON rtls_events (location_id, time DESC);
CREATE INDEX idx_rtls_zone ON rtls_events (zone_id, time DESC);
CREATE INDEX idx_rtls_tag ON rtls_events (tag_id, time DESC);

-- Maintenance events
CREATE INDEX idx_maint_asset ON maintenance_events (asset_id, time DESC);
CREATE INDEX idx_maint_failure ON maintenance_events (asset_id, time DESC) WHERE failure_occurred = true;
CREATE INDEX idx_maint_work_order ON maintenance_events (work_order_id);

-- Error events
CREATE INDEX idx_error_asset ON error_events (asset_id, time DESC);
CREATE INDEX idx_error_severity ON error_events (severity, time DESC);
CREATE INDEX idx_error_code ON error_events (error_code, time DESC);

-- ============================================================================
-- DATA RETENTION POLICIES
-- ============================================================================

-- Keep detailed telemetry for 90 days
SELECT add_retention_policy('asset_telemetry', INTERVAL '90 days', if_not_exists => TRUE);

-- Keep RTLS data for 30 days
SELECT add_retention_policy('rtls_events', INTERVAL '30 days', if_not_exists => TRUE);

-- Keep error events for 180 days
SELECT add_retention_policy('error_events', INTERVAL '180 days', if_not_exists => TRUE);

-- Keep maintenance events for 5 years (compliance requirement)
SELECT add_retention_policy('maintenance_events', INTERVAL '5 years', if_not_exists => TRUE);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get latest health score for an asset
CREATE OR REPLACE FUNCTION get_asset_health(p_asset_id UUID)
RETURNS TABLE (
    health_score INTEGER,
    health_status health_status,
    failure_probability DOUBLE PRECISION,
    last_updated TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.health_score,
        t.health_status,
        t.failure_probability,
        t.time as last_updated
    FROM asset_telemetry t
    WHERE t.asset_id = p_asset_id
        AND t.health_score IS NOT NULL
    ORDER BY t.time DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Get asset metrics summary for time range
CREATE OR REPLACE FUNCTION get_asset_metrics_summary(
    p_asset_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    metric_name VARCHAR,
    avg_value DOUBLE PRECISION,
    min_value DOUBLE PRECISION,
    max_value DOUBLE PRECISION,
    sample_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.metric_name,
        AVG(t.metric_value)::DOUBLE PRECISION,
        MIN(t.metric_value)::DOUBLE PRECISION,
        MAX(t.metric_value)::DOUBLE PRECISION,
        COUNT(*)::BIGINT
    FROM asset_telemetry t
    WHERE t.asset_id = p_asset_id
        AND t.time >= p_start_time
        AND t.time <= p_end_time
    GROUP BY t.metric_name;
END;
$$ LANGUAGE plpgsql;

-- Export training data for ML
CREATE OR REPLACE FUNCTION export_ml_training_data(
    p_start_date DATE,
    p_end_date DATE,
    p_asset_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    time TIMESTAMPTZ,
    asset_id UUID,
    asset_type VARCHAR,
    metric_name VARCHAR,
    metric_value DOUBLE PRECISION,
    health_score INTEGER,
    health_status health_status,
    failure_within_7d BOOLEAN,
    failure_type failure_type,
    hours_to_failure DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.time,
        t.asset_id,
        t.asset_type,
        t.metric_name,
        t.metric_value,
        t.health_score,
        t.health_status,
        -- Check if failure occurred within 7 days
        EXISTS (
            SELECT 1 FROM maintenance_events m
            WHERE m.asset_id = t.asset_id
                AND m.failure_occurred = true
                AND m.time BETWEEN t.time AND t.time + INTERVAL '7 days'
        ) as failure_within_7d,
        -- Get failure type if exists
        (
            SELECT m.failure_type FROM maintenance_events m
            WHERE m.asset_id = t.asset_id
                AND m.failure_occurred = true
                AND m.time > t.time
            ORDER BY m.time ASC
            LIMIT 1
        ) as failure_type,
        -- Calculate hours to next failure
        EXTRACT(EPOCH FROM (
            (
                SELECT m.time FROM maintenance_events m
                WHERE m.asset_id = t.asset_id
                    AND m.failure_occurred = true
                    AND m.time > t.time
                ORDER BY m.time ASC
                LIMIT 1
            ) - t.time
        )) / 3600 as hours_to_failure
    FROM asset_telemetry t
    WHERE t.time >= p_start_date
        AND t.time < p_end_date
        AND (p_asset_types IS NULL OR t.asset_type = ANY(p_asset_types));
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE asset_telemetry IS 'Time-series telemetry data from medical equipment sensors';
COMMENT ON TABLE rtls_events IS 'Real-time location tracking events from RFID/BLE';
COMMENT ON TABLE maintenance_events IS 'Maintenance and failure events for ML training';
COMMENT ON MATERIALIZED VIEW asset_telemetry_hourly IS 'Continuous aggregate for hourly metric summaries';
COMMENT ON FUNCTION export_ml_training_data IS 'Export labeled training data for predictive maintenance ML models';
