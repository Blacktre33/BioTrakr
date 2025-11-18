/**
 * Canonical domain types shared across MedAsset Pro services.
 * Exporting these interfaces keeps the API, web app, and future mobile
 * clients aligned with the Prisma data model and avoids drift between
 * independently declared types.
 */

export type Uuid = string;

// Asset --------------------------------------------------------------

/**
 * Supported asset lifecycle statuses. Aligns with Prisma enum-like strings.
 */
export type AssetStatus = "available" | "in_use" | "maintenance" | "retired";

/**
 * Supported asset condition values. Centralising the union allows the web
 * UI to stay in sync with backend validation rules.
 */
export type AssetCondition = "excellent" | "good" | "fair" | "poor";

/**
 * Primitive asset summary used by the dashboard lists. The API can expose a
 * superset of fields while the UI consumes just the essentials.
 */
export interface AssetSummary {
  id: Uuid;
  name: string;
  assetTag: string;
  status: AssetStatus;
  category: string;
  facility: string;
  lastSeen: string;
}

/**
 * Full asset record mirroring the Prisma schema. Optional fields are marked
 * with `?` to reflect nullable columns.
 */
export interface Asset {
  id: Uuid;
  organizationId: Uuid;
  facilityId: Uuid;
  departmentId?: Uuid | null;
  name: string;
  description?: string | null;
  assetTag: string;
  serialNumber?: string | null;
  category: string;
  manufacturer: string;
  model: string;
  purchaseDate?: string | null;
  purchaseCost?: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  currentLocation?: Record<string, unknown> | null;
  customFields?: Record<string, unknown> | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface AssetLocationPing {
  id: Uuid;
  assetId: Uuid;
  latitude: number;
  longitude: number;
  status: AssetStatus;
  observedAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface AssetScanLog {
  id: Uuid;
  assetId: Uuid;
  qrPayload: string;
  notes?: string | null;
  locationHint?: string | null;
  createdAt: string;
}

// Telemetry Labeling Standards -------------------------------------------------

/**
 * Failure types for predictive maintenance ML models.
 * Used to label training data and classify failure events.
 */
export type FailureType =
  | "no_failure"
  | "mechanical_failure"
  | "electrical_failure"
  | "software_failure"
  | "calibration_drift"
  | "component_wear"
  | "unknown_failure";

/**
 * Time-to-failure categories for survival analysis models.
 * Indicates urgency of maintenance intervention.
 */
export type TimeToFailure = "0-24h" | "1-7d" | "7-30d" | "30d+";

/**
 * Equipment health status categories.
 * Maps to health_score ranges: critical (0-20), poor (21-40), fair (41-60),
 * good (61-80), excellent (81-100).
 */
export type HealthStatus = "critical" | "poor" | "fair" | "good" | "excellent";

/**
 * Label quality/provenance indicators.
 * Tracks how labels were generated for ML training data.
 */
export type LabelQuality =
  | "verified" // Human-confirmed
  | "automated" // System-generated
  | "inferred" // Derived from related data
  | "estimated" // Based on models/heuristics
  | "synthetic"; // Artificially generated

/**
 * Event severity levels for prioritization.
 */
export type EventSeverity = "critical" | "high" | "medium" | "low" | "info";

/**
 * FDA-aligned risk classification for medical devices.
 */
export type RiskClass = "class_i" | "class_ii" | "class_iii";

/**
 * Standard telemetry event domains for metric naming.
 * Follows pattern: {domain}.{entity}.{action}.{metric_type}
 */
export type TelemetryDomain =
  | "asset"
  | "rtls"
  | "maintenance"
  | "compliance"
  | "user"
  | "system"
  | "ml";

/**
 * Event categories for telemetry classification.
 */
export type EventCategory =
  | "location"
  | "maintenance"
  | "compliance"
  | "operational"
  | "system";

/**
 * ML training labels attached to telemetry events.
 * Populated by labeling pipeline for model training.
 */
export interface MLTrainingLabels {
  failure_within_7d?: boolean;
  failure_type?: FailureType;
  time_to_failure_hours?: number;
  time_to_failure_category?: TimeToFailure;
  health_score?: number; // 0-100
  health_status?: HealthStatus;
  requires_pm?: boolean;
  anomaly_detected?: boolean;
  failure_probability?: number; // 0.0-1.0
  label_source?: string;
  label_confidence?: number; // 0.0-1.0
  label_quality?: LabelQuality;
  labeled_by?: string;
  labeled_at?: string;
}

/**
 * Standard telemetry event structure following naming conventions.
 * Extends base payload with categorization and ML labels.
 */
export interface TelemetryEvent {
  // Naming convention: domain.entity.action.metric_type
  name: string;

  // Standard tags (always required)
  timestamp: string;
  facility_id: string;
  asset_id?: string;
  environment: string;
  service_name: string;
  trace_id?: string;

  // Categorization
  asset_category?: string;
  asset_type?: string;
  department?: string;
  event_category?: EventCategory;
  severity?: EventSeverity;
  risk_class?: RiskClass;

  // Measurement
  value: number;
  unit?: string;

  // ML labels (optional - populated by labeling pipeline)
  labels?: MLTrainingLabels;

  // Additional metadata
  metadata?: Record<string, unknown>;
}

/**
 * Sensor reading features for ML training data.
 * Represents the feature vector used in predictive maintenance models.
 */
export interface SensorReadingFeatures {
  temperature_celsius?: number;
  vibration_rms?: number;
  power_consumption_watts?: number;
  operating_hours?: number;
  cycles_since_maintenance?: number;
  error_count_24h?: number;
  ambient_humidity_percent?: number;
  [key: string]: number | undefined; // Allow additional sensor features
}

/**
 * Complete training data record combining features and labels.
 * Used for exporting ML training datasets from telemetry data.
 */
export interface MLTrainingRecord {
  record_id: string;
  asset_id: string;
  timestamp: string;
  features: SensorReadingFeatures;
  labels: MLTrainingLabels;
  metadata?: {
    label_source?: string;
    label_confidence?: number;
    labeled_by?: string;
    labeled_at?: string;
  };
}

// Telemetry Ingestion ---------------------------------------------------------

export interface TelemetryIngestPayload {
  assetExternalId?: string;
  assetId?: Uuid;
  deviceId: string;
  latitude: number;
  longitude: number;
  status: AssetStatus;
  recordedAt: string;
  metadata?: Record<string, unknown>;
  
  // Enhanced fields for labeling standards
  metricName?: string; // domain.entity.action.metric_type
  metricValue?: number;
  metricUnit?: string;
  assetCategory?: string;
  assetType?: string;
  department?: string;
  eventCategory?: EventCategory;
  severity?: EventSeverity;
  mlLabels?: MLTrainingLabels;
}

export interface TelemetryIngestEvent {
  id: Uuid;
  assetId?: Uuid | null;
  deviceId: string;
  payload: TelemetryIngestPayload;
  receivedAt: string;
  processedAt?: string | null;
  status: "pending" | "processed" | "failed";
}

// Organisation -------------------------------------------------------

export interface Organization {
  id: Uuid;
  name: string;
  type: "hospital" | "clinic" | "health_system";
  settings?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Facility {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  address: Record<string, unknown>;
  timezone: string;
  floorPlans?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: Uuid;
  facilityId: Uuid;
  name: string;
  code: string;
  floor?: number | null;
  createdAt: string;
  updatedAt: string;
}

// Users & Security ---------------------------------------------------

export type UserRole =
  | "admin"
  | "engineer"
  | "technician"
  | "clinical_staff"
  | "viewer";

export interface Permission {
  name: string;
  description?: string;
}

export interface User {
  id: Uuid;
  organizationId: Uuid;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  permissions?: Permission[];
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sanitised user payload injected into auth contexts after verification.
 */
export interface AuthenticatedUser {
  id: Uuid;
  organizationId: Uuid;
  role: UserRole;
  permissions: Permission[];
  email: string;
  firstName: string;
  lastName: string;
  sessionIssuedAt: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

// Maintenance --------------------------------------------------------

export type MaintenanceStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "overdue";

export interface MaintenanceTask {
  id: Uuid;
  assetId: Uuid;
  requestedById: Uuid;
  assignedToId?: Uuid | null;
  status: MaintenanceStatus;
  priority: "low" | "medium" | "high";
  summary: string;
  details?: string | null;
  scheduledFor?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceEventLog {
  id: Uuid;
  maintenanceId: Uuid;
  assetId: Uuid;
  eventType: string;
  payload?: Record<string, unknown> | null;
  occurredAt: string;
}

// Utility ------------------------------------------------------------

export interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: Pagination;
}
