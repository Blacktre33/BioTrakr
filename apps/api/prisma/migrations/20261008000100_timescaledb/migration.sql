-- =====================================================
-- TimescaleDB features that Prisma cannot express in schema.prisma.
-- Ported from the former loose files timescaledb-setup.sql and
-- 20251118000000_telemetry_schema/002_telemetry_schema.sql.
--
-- Rules that keep `prisma migrate diff` (the drift check) clean:
--   * create_default_indexes => FALSE, so Timescale adds no indexes
--     that schema.prisma does not declare.
--   * Every primary key already includes the time column (see @@id in
--     schema.prisma), which hypertables require.
--   * Views, functions, triggers and CHECK constraints are ignored by
--     Prisma's differ, so they are safe to define here.
-- =====================================================

-- -----------------------------------------------------
-- Hypertables
-- -----------------------------------------------------
SELECT create_hypertable('location_history', 'timestamp',
  chunk_time_interval => INTERVAL '7 days', create_default_indexes => FALSE,
  if_not_exists => TRUE, migrate_data => TRUE);

SELECT create_hypertable('usage_logs', 'sessionStartTime',
  chunk_time_interval => INTERVAL '30 days', create_default_indexes => FALSE,
  if_not_exists => TRUE, migrate_data => TRUE);

SELECT create_hypertable('iot_sensor_readings', 'timestamp',
  chunk_time_interval => INTERVAL '7 days', create_default_indexes => FALSE,
  if_not_exists => TRUE, migrate_data => TRUE);

SELECT create_hypertable('predictive_scores_history', 'timestamp',
  chunk_time_interval => INTERVAL '30 days', create_default_indexes => FALSE,
  if_not_exists => TRUE, migrate_data => TRUE);

SELECT create_hypertable('asset_telemetry', 'time',
  chunk_time_interval => INTERVAL '1 day', create_default_indexes => FALSE,
  if_not_exists => TRUE, migrate_data => TRUE);

SELECT create_hypertable('maintenance_events', 'time',
  chunk_time_interval => INTERVAL '7 days', create_default_indexes => FALSE,
  if_not_exists => TRUE, migrate_data => TRUE);

SELECT create_hypertable('error_events', 'time',
  chunk_time_interval => INTERVAL '1 day', create_default_indexes => FALSE,
  if_not_exists => TRUE, migrate_data => TRUE);

-- -----------------------------------------------------
-- Value-range guards for labelled telemetry
-- -----------------------------------------------------
ALTER TABLE asset_telemetry
  ADD CONSTRAINT asset_telemetry_health_score_range CHECK (health_score BETWEEN 0 AND 100),
  ADD CONSTRAINT asset_telemetry_failure_probability_range CHECK (failure_probability BETWEEN 0 AND 1),
  ADD CONSTRAINT asset_telemetry_label_confidence_range CHECK (label_confidence BETWEEN 0 AND 1);

-- -----------------------------------------------------
-- Compression (primary-key columns are part of orderby/segmentby)
-- -----------------------------------------------------
ALTER TABLE location_history SET (timescaledb.compress,
  timescaledb.compress_segmentby = '"assetId"',
  timescaledb.compress_orderby = '"timestamp" DESC, "id"');
SELECT add_compression_policy('location_history', INTERVAL '30 days', if_not_exists => TRUE);

ALTER TABLE usage_logs SET (timescaledb.compress,
  timescaledb.compress_segmentby = '"assetId"',
  timescaledb.compress_orderby = '"sessionStartTime" DESC, "id"');
SELECT add_compression_policy('usage_logs', INTERVAL '180 days', if_not_exists => TRUE);

ALTER TABLE iot_sensor_readings SET (timescaledb.compress,
  timescaledb.compress_segmentby = '"sensorId"',
  timescaledb.compress_orderby = '"timestamp" DESC, "id"');
SELECT add_compression_policy('iot_sensor_readings', INTERVAL '90 days', if_not_exists => TRUE);

ALTER TABLE asset_telemetry SET (timescaledb.compress,
  timescaledb.compress_segmentby = 'asset_id, facility_id',
  timescaledb.compress_orderby = 'time DESC, id');
SELECT add_compression_policy('asset_telemetry', INTERVAL '7 days', if_not_exists => TRUE);

-- -----------------------------------------------------
-- Retention: intentionally NOT enabled.
-- The previous files deleted RTLS/location data after 30 days-2 years,
-- telemetry after 90 days and error events after 180 days. Device
-- service and location history is compliance evidence, so automatic
-- deletion needs an explicit records-retention decision first.
-- Previous settings, for reference:
--   add_retention_policy('location_history',    INTERVAL '2 years')
--   add_retention_policy('iot_sensor_readings', INTERVAL '3 years')
--   add_retention_policy('usage_logs',          INTERVAL '5 years')
--   add_retention_policy('asset_telemetry',     INTERVAL '90 days')
--   add_retention_policy('error_events',        INTERVAL '180 days')
--   add_retention_policy('maintenance_events',  INTERVAL '5 years')
-- -----------------------------------------------------

-- -----------------------------------------------------
-- Continuous aggregates (WITH NO DATA so they can be created
-- inside the migration transaction; the policies backfill them)
-- -----------------------------------------------------
CREATE MATERIALIZED VIEW asset_telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  asset_id, facility_id, asset_type, metric_name,
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
  start_offset => INTERVAL '3 hours', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour', if_not_exists => TRUE);

CREATE MATERIALIZED VIEW asset_telemetry_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  asset_id, facility_id, asset_type, metric_name,
  AVG(metric_value) AS avg_value,
  MIN(metric_value) AS min_value,
  MAX(metric_value) AS max_value,
  COUNT(*) AS sample_count,
  AVG(health_score) AS avg_health_score,
  COUNT(*) FILTER (WHERE anomaly_detected = true) AS anomaly_count,
  AVG(failure_probability) AS avg_failure_probability
FROM asset_telemetry
GROUP BY bucket, asset_id, facility_id, asset_type, metric_name
WITH NO DATA;

SELECT add_continuous_aggregate_policy('asset_telemetry_daily',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day', if_not_exists => TRUE);

CREATE MATERIALIZED VIEW location_history_hourly
WITH (timescaledb.continuous) AS
SELECT
  "assetId",
  time_bucket('1 hour', "timestamp") AS hour,
  COUNT(*) AS location_updates,
  AVG("accuracyMeters") AS avg_accuracy,
  MAX("signalStrength") AS max_signal_strength
FROM location_history
GROUP BY "assetId", hour
WITH NO DATA;

SELECT add_continuous_aggregate_policy('location_history_hourly',
  start_offset => INTERVAL '3 hours', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour', if_not_exists => TRUE);

CREATE MATERIALIZED VIEW usage_logs_daily
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

SELECT add_continuous_aggregate_policy('usage_logs_daily',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- -----------------------------------------------------
-- Telemetry helper functions (asset ids are TEXT, matching assets.id)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION get_asset_health(p_asset_id TEXT)
RETURNS TABLE (
  health_score INTEGER,
  health_status health_status,
  failure_probability DOUBLE PRECISION,
  last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT t.health_score, t.health_status, t.failure_probability, t.time
  FROM asset_telemetry t
  WHERE t.asset_id = p_asset_id AND t.health_score IS NOT NULL
  ORDER BY t.time DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_asset_metrics_summary(
  p_asset_id TEXT, p_start_time TIMESTAMPTZ, p_end_time TIMESTAMPTZ
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
  SELECT t.metric_name,
         AVG(t.metric_value)::DOUBLE PRECISION,
         MIN(t.metric_value)::DOUBLE PRECISION,
         MAX(t.metric_value)::DOUBLE PRECISION,
         COUNT(*)::BIGINT
  FROM asset_telemetry t
  WHERE t.asset_id = p_asset_id AND t.time >= p_start_time AND t.time <= p_end_time
  GROUP BY t.metric_name;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION export_ml_training_data(
  p_start_date DATE, p_end_date DATE, p_asset_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  "time" TIMESTAMPTZ,
  asset_id TEXT,
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
    t.time, t.asset_id, t.asset_type, t.metric_name, t.metric_value,
    t.health_score, t.health_status,
    EXISTS (
      SELECT 1 FROM maintenance_events m
      WHERE m.asset_id = t.asset_id AND m.failure_occurred = true
        AND m.time BETWEEN t.time AND t.time + INTERVAL '7 days'
    ),
    (
      SELECT m.failure_type FROM maintenance_events m
      WHERE m.asset_id = t.asset_id AND m.failure_occurred = true AND m.time > t.time
      ORDER BY m.time ASC LIMIT 1
    ),
    (EXTRACT(EPOCH FROM (
      (SELECT m.time FROM maintenance_events m
       WHERE m.asset_id = t.asset_id AND m.failure_occurred = true AND m.time > t.time
       ORDER BY m.time ASC LIMIT 1) - t.time
    )) / 3600)::DOUBLE PRECISION
  FROM asset_telemetry t
  WHERE t.time >= p_start_date AND t.time < p_end_date
    AND (p_asset_types IS NULL OR t.asset_type = ANY(p_asset_types));
END;
$$ LANGUAGE plpgsql STABLE;

-- -----------------------------------------------------
-- Asset helpers and triggers
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_current_book_value(
  p_purchase_cost DECIMAL, p_purchase_date DATE, p_depreciation_method TEXT,
  p_useful_life_years INTEGER, p_salvage_value DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
  v_years_elapsed DECIMAL;
  v_depreciable_amount DECIMAL;
  v_book_value DECIMAL;
BEGIN
  v_years_elapsed := (CURRENT_DATE - p_purchase_date) / 365.25;
  v_depreciable_amount := p_purchase_cost - COALESCE(p_salvage_value, 0);
  IF p_depreciation_method = 'DECLINING_BALANCE' THEN
    v_book_value := p_purchase_cost * POWER(1 - (1.0 / p_useful_life_years), v_years_elapsed);
  ELSIF p_depreciation_method = 'DOUBLE_DECLINING' THEN
    v_book_value := p_purchase_cost * POWER(1 - (2.0 / p_useful_life_years), v_years_elapsed);
  ELSE
    v_book_value := p_purchase_cost - (v_depreciable_amount / p_useful_life_years) * v_years_elapsed;
  END IF;
  RETURN GREATEST(v_book_value, COALESCE(p_salvage_value, 0));
END;
$$ LANGUAGE plpgsql STABLE;

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

CREATE TRIGGER set_pm_compliance_status
  BEFORE INSERT OR UPDATE OF "nextPmDueDate" ON assets
  FOR EACH ROW EXECUTE FUNCTION update_pm_compliance_status();

CREATE OR REPLACE FUNCTION increment_asset_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_version_on_update
  BEFORE UPDATE ON assets
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION increment_asset_version();

-- -----------------------------------------------------
-- Reporting views (exclude soft-deleted assets)
-- -----------------------------------------------------
CREATE OR REPLACE VIEW v_active_assets_with_location AS
SELECT a.id, a."assetTagNumber", a."equipmentName", a."modelNumber", a."serialNumber",
       a."assetStatus", a."criticalityLevel", f."facilityName", b."buildingName",
       fl."floorName", r."roomName", a."lastSeenTimestamp",
       a."currentCoordinatesX", a."currentCoordinatesY", a."currentCoordinatesZ"
FROM assets a
LEFT JOIN facilities f ON a."currentFacilityId" = f.id
LEFT JOIN buildings b ON a."currentBuildingId" = b.id
LEFT JOIN floors fl ON a."currentFloorId" = fl.id
LEFT JOIN rooms r ON a."currentRoomId" = r.id
WHERE a."deletedAt" IS NULL AND a."assetStatus" IN ('ACTIVE', 'IN_SERVICE');

CREATE OR REPLACE VIEW v_overdue_maintenance AS
SELECT a.id, a."assetTagNumber", a."equipmentName", a."nextPmDueDate",
       CURRENT_DATE - a."nextPmDueDate"::date AS days_overdue,
       a."criticalityLevel",
       u."firstName" || ' ' || u."lastName" AS custodian_name,
       u.email AS custodian_email, d."departmentName"
FROM assets a
JOIN users u ON a."primaryCustodianId" = u.id
JOIN departments d ON a."custodianDepartmentId" = d.id
WHERE a."deletedAt" IS NULL AND a."nextPmDueDate" < CURRENT_DATE
  AND a."assetStatus" IN ('ACTIVE', 'IN_SERVICE');

CREATE OR REPLACE VIEW v_high_risk_assets AS
SELECT a.id, a."assetTagNumber", a."equipmentName", a."failureProbabilityScore",
       a."predictedFailureDate", a."failureCategory", a."criticalityLevel",
       a."mtbfHours", a."lastFailureDate", r."roomName" AS current_location
FROM assets a
LEFT JOIN rooms r ON a."currentRoomId" = r.id
WHERE a."deletedAt" IS NULL AND a."failureProbabilityScore" >= 70
  AND a."assetStatus" IN ('ACTIVE', 'IN_SERVICE');

CREATE OR REPLACE VIEW v_asset_utilization AS
SELECT a.id, a."assetTagNumber", a."equipmentName", a."deviceCategory",
       a."totalUsageHours", a."utilizationRatePercent", a."idleTimeHoursLast30Days",
       a."lastUsedTimestamp",
       CASE
         WHEN a."utilizationRatePercent" < 20 THEN 'UNDERUTILIZED'
         WHEN a."utilizationRatePercent" > 80 THEN 'HIGH_DEMAND'
         ELSE 'NORMAL'
       END AS utilization_status
FROM assets a
WHERE a."deletedAt" IS NULL AND a."assetStatus" IN ('ACTIVE', 'IN_SERVICE');
