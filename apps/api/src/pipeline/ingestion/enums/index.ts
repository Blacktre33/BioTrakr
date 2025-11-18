// BioTrakr Enums
// Matches PostgreSQL enum types from migrations

export enum AssetStatus {
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  MAINTENANCE = 'maintenance',
  REPAIR = 'repair',
  DECOMMISSIONED = 'decommissioned',
  RETIRED = 'retired',
  LOST = 'lost',
  QUARANTINE = 'quarantine',
}

export enum AssetCondition {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  CRITICAL = 'critical',
  UNKNOWN = 'unknown',
}

export enum LifecycleStage {
  PROCUREMENT = 'procurement',
  RECEIVING = 'receiving',
  INSTALLATION = 'installation',
  COMMISSIONING = 'commissioning',
  ACTIVE = 'active',
  END_OF_LIFE = 'end_of_life',
  DISPOSAL = 'disposal',
}

export enum RiskClass {
  CLASS_I = 'class_i',
  CLASS_II = 'class_ii',
  CLASS_III = 'class_iii',
}

export enum MaintenanceType {
  PREVENTIVE = 'preventive',
  CORRECTIVE = 'corrective',
  PREDICTIVE = 'predictive',
  EMERGENCY = 'emergency',
  CALIBRATION = 'calibration',
  INSPECTION = 'inspection',
}

export enum WorkOrderStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum CertificationStatus {
  VALID = 'valid',
  EXPIRING_SOON = 'expiring_soon',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  PENDING = 'pending',
}

export enum EventSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

export enum HealthStatus {
  CRITICAL = 'critical',
  POOR = 'poor',
  FAIR = 'fair',
  GOOD = 'good',
  EXCELLENT = 'excellent',
}

export enum LabelSource {
  VERIFIED = 'verified',
  AUTOMATED = 'automated',
  INFERRED = 'inferred',
  ESTIMATED = 'estimated',
  SYNTHETIC = 'synthetic',
}

export enum FailureType {
  NO_FAILURE = 'no_failure',
  MECHANICAL = 'mechanical_failure',
  ELECTRICAL = 'electrical_failure',
  SOFTWARE = 'software_failure',
  CALIBRATION = 'calibration_drift',
  WEAR = 'component_wear',
  UNKNOWN = 'unknown_failure',
}

// Asset Categories (from seed data)
export enum AssetCategory {
  DIAGNOSTIC_IMAGING = 'diagnostic_imaging',
  LIFE_SUPPORT = 'life_support',
  SURGICAL = 'surgical',
  LABORATORY = 'laboratory',
  PATIENT_CARE = 'patient_care',
  INFRASTRUCTURE = 'infrastructure',
}

// Event Categories (from labeling guide)
export enum EventCategory {
  LOCATION = 'location',
  MAINTENANCE = 'maintenance',
  COMPLIANCE = 'compliance',
  OPERATIONAL = 'operational',
  SYSTEM = 'system',
  ML = 'ml',
}

// Event Types
export enum LocationEventType {
  POSITION_UPDATE = 'position_update',
  ZONE_ENTRY = 'zone_entry',
  ZONE_EXIT = 'zone_exit',
  GEOFENCE_BREACH = 'geofence_breach',
}

export enum MaintenanceEventType {
  PM_SCHEDULED = 'pm_scheduled',
  PM_COMPLETED = 'pm_completed',
  PM_OVERDUE = 'pm_overdue',
  REPAIR_REQUESTED = 'repair_requested',
  REPAIR_COMPLETED = 'repair_completed',
}

export enum SourceType {
  RFID = 'rfid',
  BLE = 'ble',
  WIFI = 'wifi',
  GPS = 'gps',
  MANUAL = 'manual',
  SCAN = 'scan',
}
