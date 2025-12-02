export type Uuid = string;
export type AssetStatus = "available" | "in_use" | "maintenance" | "retired";
export type AssetCondition = "excellent" | "good" | "fair" | "poor";
export interface AssetSummary {
    id: Uuid;
    name: string;
    assetTag: string;
    status: AssetStatus;
    category: string;
    facility: string;
    lastSeen: string;
}
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
export type FailureType = "no_failure" | "mechanical_failure" | "electrical_failure" | "software_failure" | "calibration_drift" | "component_wear" | "unknown_failure";
export type TimeToFailure = "0-24h" | "1-7d" | "7-30d" | "30d+";
export type HealthStatus = "critical" | "poor" | "fair" | "good" | "excellent";
export type LabelQuality = "verified" | "automated" | "inferred" | "estimated" | "synthetic";
export type EventSeverity = "critical" | "high" | "medium" | "low" | "info";
export type RiskClass = "class_i" | "class_ii" | "class_iii";
export type TelemetryDomain = "asset" | "rtls" | "maintenance" | "compliance" | "user" | "system" | "ml";
export type EventCategory = "location" | "maintenance" | "compliance" | "operational" | "system";
export interface MLTrainingLabels {
    failure_within_7d?: boolean;
    failure_type?: FailureType;
    time_to_failure_hours?: number;
    time_to_failure_category?: TimeToFailure;
    health_score?: number;
    health_status?: HealthStatus;
    requires_pm?: boolean;
    anomaly_detected?: boolean;
    failure_probability?: number;
    label_source?: string;
    label_confidence?: number;
    label_quality?: LabelQuality;
    labeled_by?: string;
    labeled_at?: string;
}
export interface TelemetryEvent {
    name: string;
    timestamp: string;
    facility_id: string;
    asset_id?: string;
    environment: string;
    service_name: string;
    trace_id?: string;
    asset_category?: string;
    asset_type?: string;
    department?: string;
    event_category?: EventCategory;
    severity?: EventSeverity;
    risk_class?: RiskClass;
    value: number;
    unit?: string;
    labels?: MLTrainingLabels;
    metadata?: Record<string, unknown>;
}
export interface SensorReadingFeatures {
    temperature_celsius?: number;
    vibration_rms?: number;
    power_consumption_watts?: number;
    operating_hours?: number;
    cycles_since_maintenance?: number;
    error_count_24h?: number;
    ambient_humidity_percent?: number;
    [key: string]: number | undefined;
}
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
export interface TelemetryIngestPayload {
    assetExternalId?: string;
    assetId?: Uuid;
    deviceId: string;
    latitude: number;
    longitude: number;
    status: AssetStatus;
    recordedAt: string;
    metadata?: Record<string, unknown>;
    metricName?: string;
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
export type UserRole = "admin" | "engineer" | "technician" | "clinical_staff" | "viewer";
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
export type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "overdue";
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
export interface Pagination {
    page: number;
    pageSize: number;
    totalCount: number;
}
export interface PaginatedResult<T> {
    items: T[];
    pagination: Pagination;
}
