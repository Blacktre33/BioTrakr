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

export interface TelemetryIngestPayload {
  assetExternalId?: string;
  assetId?: Uuid;
  deviceId: string;
  latitude: number;
  longitude: number;
  status: AssetStatus;
  recordedAt: string;
  metadata?: Record<string, unknown>;
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
