-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'IN_SERVICE', 'IN_MAINTENANCE', 'QUARANTINED', 'CONDEMNED', 'RETIRED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "DeviceCategory" AS ENUM ('IMAGING', 'LABORATORY', 'SURGICAL', 'PATIENT_MONITORING', 'THERAPEUTIC', 'LIFE_SUPPORT', 'DIAGNOSTIC', 'ANESTHESIA', 'STERILIZATION', 'SUPPORT_EQUIPMENT', 'IT_MEDICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CriticalityLevel" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RiskClassification" AS ENUM ('CLASS_I', 'CLASS_II', 'CLASS_III');

-- CreateEnum
CREATE TYPE "RecallStatus" AS ENUM ('NONE', 'CLASS_I', 'CLASS_II', 'CLASS_III');

-- CreateEnum
CREATE TYPE "PMComplianceStatus" AS ENUM ('COMPLIANT', 'GRACE_PERIOD', 'OVERDUE', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FailureCategory" AS ENUM ('ELECTRICAL', 'MECHANICAL', 'SOFTWARE', 'HYDRAULIC', 'PNEUMATIC', 'SENSOR', 'CALIBRATION', 'USER_ERROR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'DOUBLE_DECLINING', 'UNITS_OF_PRODUCTION', 'SUM_OF_YEARS_DIGITS');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SYNCED', 'PENDING', 'FAILED', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "ServiceLevel" AS ENUM ('TWO_HOURS', 'FOUR_HOURS', 'EIGHT_HOURS', 'TWENTY_FOUR_HOURS', 'NEXT_DAY', 'BEST_EFFORT');

-- CreateEnum
CREATE TYPE "WasteHandling" AS ENUM ('STANDARD', 'BIOHAZARD', 'RADIOACTIVE', 'CHEMICAL', 'SHARPS', 'PHARMACEUTICAL');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_PARTS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderType" AS ENUM ('PREVENTIVE_MAINTENANCE', 'CORRECTIVE_MAINTENANCE', 'CALIBRATION', 'INSPECTION', 'EMERGENCY_REPAIR', 'INSTALLATION', 'DECOMMISSIONING');

-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('MANUFACTURER', 'DISTRIBUTOR', 'SERVICE_PROVIDER', 'PARTS_SUPPLIER');

-- CreateEnum
CREATE TYPE "TrackingMethod" AS ENUM ('RFID', 'BLE', 'QR', 'GPS', 'MANUAL', 'NFC');

-- CreateEnum
CREATE TYPE "event_severity" AS ENUM ('critical', 'high', 'medium', 'low', 'info');

-- CreateEnum
CREATE TYPE "health_status" AS ENUM ('critical', 'poor', 'fair', 'good', 'excellent');

-- CreateEnum
CREATE TYPE "label_source" AS ENUM ('verified', 'automated', 'inferred', 'estimated', 'synthetic');

-- CreateEnum
CREATE TYPE "failure_type" AS ENUM ('no_failure', 'mechanical_failure', 'electrical_failure', 'software_failure', 'calibration_drift', 'component_wear', 'unknown_failure');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityCode" TEXT NOT NULL,
    "facilityName" TEXT NOT NULL,
    "facilityType" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "stateProvince" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "licenseNumber" TEXT,
    "accreditationBody" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "buildingCode" TEXT NOT NULL,
    "buildingName" TEXT NOT NULL,
    "floorCount" INTEGER,
    "gpsLatitude" DECIMAL(10,7),
    "gpsLongitude" DECIMAL(10,7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL,
    "floorName" TEXT,
    "floorPlanImageUrl" TEXT,
    "floorPlanScaleMetersPerPixel" DECIMAL(6,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "roomType" TEXT,
    "areaSquareMeters" DECIMAL(8,2),
    "capacityBeds" INTEGER,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "geofencePolygon" JSONB,
    "centerX" DECIMAL(10,4),
    "centerY" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "parentDepartmentId" TEXT,
    "costCenter" TEXT,
    "managerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "employeeId" TEXT,
    "jobTitle" TEXT,
    "departmentId" TEXT,
    "facilityId" TEXT,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "accountLockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorType" "VendorType" NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "paymentTerms" TEXT,
    "serviceResponseTime" "ServiceLevel",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetTagNumber" TEXT NOT NULL,
    "equipmentName" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "modelNumber" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "deviceCategory" "DeviceCategory" NOT NULL,
    "deviceSubcategory" TEXT,
    "udiDeviceIdentifier" TEXT,
    "udiProductionIdentifier" TEXT,
    "gmdnCode" TEXT,
    "assetStatus" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "criticalityLevel" "CriticalityLevel" NOT NULL,
    "vendorId" TEXT,
    "purchaseOrderNumber" TEXT,
    "invoiceNumber" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "installationDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "fundingSource" TEXT,
    "grantNumber" TEXT,
    "estimatedReplacementCost" DECIMAL(12,2),
    "residualValue" DECIMAL(12,2),
    "warrantyStartDate" TIMESTAMP(3),
    "warrantyEndDate" TIMESTAMP(3),
    "warrantyTerms" TEXT,
    "amcProviderId" TEXT,
    "amcContractNumber" TEXT,
    "amcStartDate" TIMESTAMP(3),
    "amcEndDate" TIMESTAMP(3),
    "amcCostAnnual" DECIMAL(12,2),
    "cmcProviderId" TEXT,
    "serviceLevelAgreement" "ServiceLevel",
    "technicalSpecifications" JSONB,
    "softwareVersion" TEXT,
    "operatingSystem" TEXT,
    "networkMacAddress" TEXT,
    "ipAddress" TEXT,
    "powerRequirements" TEXT,
    "weightKg" DECIMAL(8,2),
    "dimensionsCm" TEXT,
    "requiresCalibration" BOOLEAN NOT NULL DEFAULT false,
    "calibrationFrequencyDays" INTEGER,
    "lastCalibrationDate" TIMESTAMP(3),
    "nextCalibrationDue" TIMESTAMP(3),
    "environmentalRequirements" TEXT,
    "riskClassification" "RiskClassification" NOT NULL,
    "fdaRegistrationNumber" TEXT,
    "fda510kNumber" TEXT,
    "ceMarkCertificate" TEXT,
    "isoCertification" TEXT,
    "recallStatus" "RecallStatus" NOT NULL DEFAULT 'NONE',
    "recallNoticeId" TEXT,
    "lastSafetyInspectionDate" TIMESTAMP(3),
    "nextSafetyInspectionDue" TIMESTAMP(3),
    "biomedicalWasteHandling" "WasteHandling",
    "requiresOperatorCertification" BOOLEAN NOT NULL DEFAULT false,
    "decontaminationProtocol" TEXT,
    "pmFrequencyDays" INTEGER,
    "lastPmDate" TIMESTAMP(3),
    "nextPmDueDate" TIMESTAMP(3),
    "pmProcedureDocument" TEXT,
    "pmEstimatedDurationHours" DECIMAL(4,1),
    "autoGenerateWorkOrders" BOOLEAN NOT NULL DEFAULT true,
    "pmComplianceStatus" "PMComplianceStatus" NOT NULL DEFAULT 'COMPLIANT',
    "currentFacilityId" TEXT NOT NULL,
    "currentBuildingId" TEXT,
    "currentFloorId" TEXT,
    "currentRoomId" TEXT,
    "currentZone" TEXT,
    "currentCoordinatesX" DECIMAL(10,4),
    "currentCoordinatesY" DECIMAL(10,4),
    "currentCoordinatesZ" DECIMAL(10,4),
    "locationAccuracyMeters" DECIMAL(4,2),
    "lastSeenTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isMoving" BOOLEAN NOT NULL DEFAULT false,
    "rfidTagId" TEXT,
    "rfidTagIds" JSONB,
    "bleBeaconMac" TEXT,
    "gpsLatitude" DECIMAL(10,7),
    "gpsLongitude" DECIMAL(10,7),
    "geofenceViolations" INTEGER NOT NULL DEFAULT 0,
    "homeLocationId" TEXT,
    "totalUsageHours" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalUsageCycles" BIGINT NOT NULL DEFAULT 0,
    "currentAssignedUserId" TEXT,
    "currentAssignedDepartmentId" TEXT,
    "utilizationRatePercent" DECIMAL(5,2),
    "idleTimeHoursLast30Days" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "lastUsedTimestamp" TIMESTAMP(3),
    "averageSessionDurationMinutes" DECIMAL(8,2),
    "peakUsageDayOfWeek" TEXT,
    "peakUsageHourOfDay" INTEGER,
    "failureProbabilityScore" DECIMAL(5,2),
    "predictedFailureDate" TIMESTAMP(3),
    "failureCategory" "FailureCategory",
    "mtbfHours" DECIMAL(12,2),
    "mttrHours" DECIMAL(8,2),
    "failureCountLifetime" INTEGER NOT NULL DEFAULT 0,
    "lastFailureDate" TIMESTAMP(3),
    "mlModelVersion" TEXT,
    "mlPredictionConfidence" DECIMAL(5,2),
    "mlLastAnalyzedTimestamp" TIMESTAMP(3),
    "iotSensorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "iotSensorIds" JSONB,
    "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "usefulLifeYears" INTEGER NOT NULL,
    "salvageValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currentBookValue" DECIMAL(12,2),
    "accumulatedDepreciation" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalMaintenanceCostLifetime" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDowntimeHoursLifetime" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "downtimeCostPerHour" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalCostOfOwnership" DECIMAL(12,2),
    "roiCalculation" DECIMAL(10,2),
    "primaryCustodianId" TEXT NOT NULL,
    "custodianDepartmentId" TEXT NOT NULL,
    "currentOperatorId" TEXT,
    "lastOperatorId" TEXT,
    "requiresCheckout" BOOLEAN NOT NULL DEFAULT false,
    "checkedOut" BOOLEAN NOT NULL DEFAULT false,
    "checkoutTimestamp" TIMESTAMP(3),
    "expectedReturnTimestamp" TIMESTAMP(3),
    "ehrSystemAssetId" TEXT,
    "cmmsPlatformAssetId" TEXT,
    "financialSystemAssetId" TEXT,
    "hl7FhirResourceId" TEXT,
    "externalSystemUrls" JSONB,
    "lastEhrSyncTimestamp" TIMESTAMP(3),
    "lastCmmsSyncTimestamp" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "pmAlertDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "calibrationAlertDaysBefore" INTEGER,
    "warrantyExpiryAlertDays" INTEGER,
    "geofenceAlertEnabled" BOOLEAN NOT NULL DEFAULT false,
    "idleAlertThresholdDays" INTEGER,
    "alertRecipients" JSONB,
    "escalationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "escalationDelayHours" INTEGER,
    "photoUrl" TEXT,
    "installationPhotoUrls" JSONB,
    "damagePhotoUrls" JSONB,
    "manualDocumentUrl" TEXT,
    "serviceManualUrl" TEXT,
    "trainingVideoUrls" JSONB,
    "qrCodeImageUrl" TEXT,
    "attachmentStoragePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_history" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "facilityId" TEXT,
    "buildingId" TEXT,
    "floorId" TEXT,
    "roomId" TEXT,
    "zone" TEXT,
    "coordinatesX" DECIMAL(10,4),
    "coordinatesY" DECIMAL(10,4),
    "coordinatesZ" DECIMAL(10,4),
    "accuracyMeters" DECIMAL(4,2),
    "isMoving" BOOLEAN,
    "signalStrength" INTEGER,
    "trackingMethod" "TrackingMethod" NOT NULL,
    "recordedByUserId" TEXT,

    CONSTRAINT "location_history_pkey" PRIMARY KEY ("id","timestamp")
);

-- CreateTable
CREATE TABLE "usage_logs" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sessionStartTime" TIMESTAMP(3) NOT NULL,
    "sessionEndTime" TIMESTAMP(3),
    "durationMinutes" DECIMAL(8,2),
    "operatorId" TEXT,
    "departmentId" TEXT,
    "patientId" TEXT,
    "procedureCode" TEXT,
    "usageCycles" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id","sessionStartTime")
);

-- CreateTable
CREATE TABLE "iot_sensor_readings" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sensorId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sensorType" TEXT NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "unit" TEXT,
    "status" TEXT,

    CONSTRAINT "iot_sensor_readings_pkey" PRIMARY KEY ("id","timestamp")
);

-- CreateTable
CREATE TABLE "predictive_scores_history" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failureProbabilityScore" DECIMAL(5,2) NOT NULL,
    "predictedFailureDate" TIMESTAMP(3),
    "failureCategory" "FailureCategory",
    "mlModelVersion" TEXT NOT NULL,
    "confidenceScore" DECIMAL(5,2),
    "contributingFactors" JSONB,

    CONSTRAINT "predictive_scores_history_pkey" PRIMARY KEY ("id","timestamp")
);

-- CreateTable
CREATE TABLE "asset_telemetry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "time" TIMESTAMPTZ(6) NOT NULL,
    "asset_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "asset_category" VARCHAR(50) NOT NULL,
    "asset_type" VARCHAR(50) NOT NULL,
    "department" VARCHAR(100),
    "risk_class" VARCHAR(20),
    "metric_name" VARCHAR(255) NOT NULL,
    "metric_value" DOUBLE PRECISION,
    "metric_unit" VARCHAR(50),
    "event_category" VARCHAR(50) NOT NULL,
    "event_source" VARCHAR(50) NOT NULL,
    "severity" "event_severity" DEFAULT 'info',
    "health_score" INTEGER,
    "health_status" "health_status",
    "anomaly_detected" BOOLEAN,
    "failure_probability" DOUBLE PRECISION,
    "predicted_failure_type" "failure_type",
    "time_to_failure_hours" DOUBLE PRECISION,
    "label_source" "label_source",
    "label_confidence" DOUBLE PRECISION,
    "model_version" VARCHAR(50),
    "trace_id" VARCHAR(100),
    "service_name" VARCHAR(100),
    "raw_payload" JSONB,

    CONSTRAINT "asset_telemetry_pkey" PRIMARY KEY ("id","time")
);

-- CreateTable
CREATE TABLE "maintenance_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "time" TIMESTAMPTZ(6) NOT NULL,
    "asset_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "work_order_id" TEXT,
    "event_type" VARCHAR(50) NOT NULL,
    "maintenance_type" VARCHAR(50),
    "failure_occurred" BOOLEAN DEFAULT false,
    "failure_type" "failure_type",
    "failure_code" VARCHAR(50),
    "root_cause" TEXT,
    "parts_replaced" JSONB,
    "labor_hours" DOUBLE PRECISION,
    "downtime_hours" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION,
    "technician_id" TEXT,
    "notes" TEXT,
    "raw_payload" JSONB,

    CONSTRAINT "maintenance_events_pkey" PRIMARY KEY ("id","time")
);

-- CreateTable
CREATE TABLE "error_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "time" TIMESTAMPTZ(6) NOT NULL,
    "asset_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "error_code" VARCHAR(50) NOT NULL,
    "error_message" TEXT,
    "error_category" VARCHAR(100),
    "severity" "event_severity" NOT NULL,
    "component" VARCHAR(100),
    "operation" VARCHAR(100),
    "sensor_readings" JSONB,
    "auto_recovered" BOOLEAN DEFAULT false,
    "requires_intervention" BOOLEAN DEFAULT false,
    "raw_payload" JSONB,

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id","time")
);

-- CreateTable
CREATE TABLE "maintenance_history" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "workOrderType" "WorkOrderType" NOT NULL,
    "workOrderStatus" "WorkOrderStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "actualDurationHours" DECIMAL(6,2),
    "assignedTechnicianId" TEXT,
    "vendorId" TEXT,
    "description" TEXT,
    "workPerformed" TEXT,
    "partsUsed" JSONB,
    "laborCost" DECIMAL(10,2),
    "partsCost" DECIMAL(10,2),
    "totalCost" DECIMAL(10,2),
    "downtimeHours" DECIMAL(6,2),
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "failureCategory" "FailureCategory",
    "rootCauseAnalysis" TEXT,
    "correctiveActions" TEXT,
    "followupRequired" BOOLEAN NOT NULL DEFAULT false,
    "followupDueDate" TIMESTAMP(3),
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_parts" (
    "id" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "manufacturer" TEXT,
    "compatibleAssetModels" JSONB,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "quantityInStock" INTEGER NOT NULL DEFAULT 0,
    "minimumStockLevel" INTEGER NOT NULL DEFAULT 0,
    "reorderQuantity" INTEGER,
    "supplierId" TEXT,
    "location" TEXT,
    "leadTimeDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_events" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "inspectorName" TEXT,
    "inspectorOrganization" TEXT,
    "certificationNumber" TEXT,
    "certificationExpiryDate" TIMESTAMP(3),
    "result" TEXT,
    "findings" TEXT,
    "correctiveActionsRequired" TEXT,
    "correctiveActionsCompleted" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "compliance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_history" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "alertType" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionNotes" TEXT,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "escalatedAt" TIMESTAMP(3),
    "escalatedToUserId" TEXT,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "notificationMethod" TEXT,
    "metadata" JSONB,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_history" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "assignedToDepartmentId" TEXT,
    "assignedByUserId" TEXT NOT NULL,
    "assignmentStartTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignmentEndTime" TIMESTAMP(3),
    "assignmentPurpose" TEXT,
    "locationAtAssignment" TEXT,
    "notes" TEXT,

    CONSTRAINT "assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_history" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromFacilityId" TEXT,
    "toFacilityId" TEXT NOT NULL,
    "fromRoomId" TEXT,
    "toRoomId" TEXT,
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initiatedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "transferReason" TEXT,
    "conditionAtTransfer" TEXT,
    "receivedByUserId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "transfer_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_records" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "userId" TEXT NOT NULL,
    "trainingDate" TIMESTAMP(3) NOT NULL,
    "trainerName" TEXT,
    "trainingType" TEXT,
    "certificationIssued" BOOLEAN NOT NULL DEFAULT false,
    "certificationNumber" TEXT,
    "certificationExpiryDate" TIMESTAMP(3),
    "hoursCompleted" DECIMAL(4,1),
    "assessmentScore" DECIMAL(5,2),
    "assessmentPassed" BOOLEAN,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_relationships" (
    "id" TEXT NOT NULL,
    "parentAssetId" TEXT NOT NULL,
    "childAssetId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_attachments" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSizeBytes" BIGINT,
    "storageUrl" TEXT NOT NULL,
    "storagePath" TEXT,
    "thumbnailUrl" TEXT,
    "category" TEXT,
    "description" TEXT,
    "uploadedByUserId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml_models" (
    "id" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "modelType" TEXT,
    "trainingDate" TIMESTAMP(3) NOT NULL,
    "accuracyScore" DECIMAL(5,4),
    "precisionScore" DECIMAL(5,4),
    "recallScore" DECIMAL(5,4),
    "f1Score" DECIMAL(5,4),
    "hyperparameters" JSONB,
    "featureList" JSONB,
    "modelFilePath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_ingest_events" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "deviceId" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "telemetry_ingest_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_scan_logs" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "qrPayload" TEXT NOT NULL,
    "notes" TEXT,
    "locationHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_scan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facilities_facilityCode_key" ON "facilities"("facilityCode");

-- CreateIndex
CREATE INDEX "facilities_organizationId_idx" ON "facilities"("organizationId");

-- CreateIndex
CREATE INDEX "buildings_facilityId_idx" ON "buildings"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_facilityId_buildingCode_key" ON "buildings"("facilityId", "buildingCode");

-- CreateIndex
CREATE INDEX "floors_buildingId_idx" ON "floors"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "floors_buildingId_floorNumber_key" ON "floors"("buildingId", "floorNumber");

-- CreateIndex
CREATE INDEX "rooms_floorId_idx" ON "rooms"("floorId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_floorId_roomCode_key" ON "rooms"("floorId", "roomCode");

-- CreateIndex
CREATE INDEX "departments_facilityId_idx" ON "departments"("facilityId");

-- CreateIndex
CREATE INDEX "departments_managerUserId_idx" ON "departments"("managerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_facilityId_departmentCode_key" ON "departments"("facilityId", "departmentCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_facilityId_idx" ON "users"("facilityId");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_vendorCode_key" ON "vendors"("vendorCode");

-- CreateIndex
CREATE UNIQUE INDEX "assets_assetTagNumber_key" ON "assets"("assetTagNumber");

-- CreateIndex
CREATE INDEX "assets_organizationId_idx" ON "assets"("organizationId");

-- CreateIndex
CREATE INDEX "assets_assetTagNumber_idx" ON "assets"("assetTagNumber");

-- CreateIndex
CREATE INDEX "assets_serialNumber_idx" ON "assets"("serialNumber");

-- CreateIndex
CREATE INDEX "assets_currentFacilityId_idx" ON "assets"("currentFacilityId");

-- CreateIndex
CREATE INDEX "assets_currentRoomId_idx" ON "assets"("currentRoomId");

-- CreateIndex
CREATE INDEX "assets_assetStatus_idx" ON "assets"("assetStatus");

-- CreateIndex
CREATE INDEX "assets_deviceCategory_idx" ON "assets"("deviceCategory");

-- CreateIndex
CREATE INDEX "assets_lastSeenTimestamp_idx" ON "assets"("lastSeenTimestamp");

-- CreateIndex
CREATE INDEX "assets_nextPmDueDate_idx" ON "assets"("nextPmDueDate");

-- CreateIndex
CREATE INDEX "assets_nextCalibrationDue_idx" ON "assets"("nextCalibrationDue");

-- CreateIndex
CREATE INDEX "assets_deletedAt_idx" ON "assets"("deletedAt");

-- CreateIndex
CREATE INDEX "assets_primaryCustodianId_idx" ON "assets"("primaryCustodianId");

-- CreateIndex
CREATE INDEX "assets_custodianDepartmentId_idx" ON "assets"("custodianDepartmentId");

-- CreateIndex
CREATE INDEX "assets_assetStatus_criticalityLevel_idx" ON "assets"("assetStatus", "criticalityLevel");

-- CreateIndex
CREATE INDEX "assets_currentFacilityId_assetStatus_idx" ON "assets"("currentFacilityId", "assetStatus");

-- CreateIndex
CREATE INDEX "idx_assets_equipment_name_trgm" ON "assets" USING GIN ("equipmentName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_assets_model_number_trgm" ON "assets" USING GIN ("modelNumber" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "location_history_assetId_timestamp_idx" ON "location_history"("assetId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "location_history_roomId_timestamp_idx" ON "location_history"("roomId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "location_history_timestamp_idx" ON "location_history"("timestamp");

-- CreateIndex
CREATE INDEX "usage_logs_assetId_sessionStartTime_idx" ON "usage_logs"("assetId", "sessionStartTime" DESC);

-- CreateIndex
CREATE INDEX "usage_logs_operatorId_sessionStartTime_idx" ON "usage_logs"("operatorId", "sessionStartTime" DESC);

-- CreateIndex
CREATE INDEX "usage_logs_sessionStartTime_idx" ON "usage_logs"("sessionStartTime");

-- CreateIndex
CREATE INDEX "iot_sensor_readings_sensorId_timestamp_idx" ON "iot_sensor_readings"("sensorId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "iot_sensor_readings_assetId_timestamp_idx" ON "iot_sensor_readings"("assetId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "iot_sensor_readings_timestamp_idx" ON "iot_sensor_readings"("timestamp");

-- CreateIndex
CREATE INDEX "predictive_scores_history_assetId_timestamp_idx" ON "predictive_scores_history"("assetId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "predictive_scores_history_timestamp_idx" ON "predictive_scores_history"("timestamp");

-- CreateIndex
CREATE INDEX "idx_telemetry_asset" ON "asset_telemetry"("asset_id", "time" DESC);

-- CreateIndex
CREATE INDEX "idx_telemetry_facility" ON "asset_telemetry"("facility_id", "time" DESC);

-- CreateIndex
CREATE INDEX "idx_telemetry_metric" ON "asset_telemetry"("metric_name", "time" DESC);

-- CreateIndex
CREATE INDEX "idx_telemetry_category" ON "asset_telemetry"("asset_category", "time" DESC);

-- CreateIndex
CREATE INDEX "idx_telemetry_health" ON "asset_telemetry"("health_status", "time" DESC);

-- CreateIndex
CREATE INDEX "idx_maint_asset" ON "maintenance_events"("asset_id", "time" DESC);

-- CreateIndex
CREATE INDEX "idx_maint_work_order" ON "maintenance_events"("work_order_id");

-- CreateIndex
CREATE INDEX "idx_error_asset" ON "error_events"("asset_id", "time" DESC);

-- CreateIndex
CREATE INDEX "idx_error_severity" ON "error_events"("severity", "time" DESC);

-- CreateIndex
CREATE INDEX "idx_error_code" ON "error_events"("error_code", "time" DESC);

-- CreateIndex
CREATE INDEX "maintenance_history_assetId_scheduledDate_idx" ON "maintenance_history"("assetId", "scheduledDate" DESC);

-- CreateIndex
CREATE INDEX "maintenance_history_workOrderStatus_idx" ON "maintenance_history"("workOrderStatus");

-- CreateIndex
CREATE INDEX "maintenance_history_assignedTechnicianId_idx" ON "maintenance_history"("assignedTechnicianId");

-- CreateIndex
CREATE UNIQUE INDEX "spare_parts_partNumber_key" ON "spare_parts"("partNumber");

-- CreateIndex
CREATE INDEX "compliance_events_assetId_eventDate_idx" ON "compliance_events"("assetId", "eventDate" DESC);

-- CreateIndex
CREATE INDEX "alert_history_assetId_triggeredAt_idx" ON "alert_history"("assetId", "triggeredAt" DESC);

-- CreateIndex
CREATE INDEX "alert_history_triggeredAt_idx" ON "alert_history"("triggeredAt" DESC);

-- CreateIndex
CREATE INDEX "alert_history_severity_triggeredAt_idx" ON "alert_history"("severity", "triggeredAt" DESC);

-- CreateIndex
CREATE INDEX "assignment_history_assetId_assignmentStartTime_idx" ON "assignment_history"("assetId", "assignmentStartTime" DESC);

-- CreateIndex
CREATE INDEX "transfer_history_assetId_transferDate_idx" ON "transfer_history"("assetId", "transferDate" DESC);

-- CreateIndex
CREATE INDEX "training_records_assetId_trainingDate_idx" ON "training_records"("assetId", "trainingDate" DESC);

-- CreateIndex
CREATE INDEX "training_records_userId_trainingDate_idx" ON "training_records"("userId", "trainingDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "asset_relationships_parentAssetId_childAssetId_relationship_key" ON "asset_relationships"("parentAssetId", "childAssetId", "relationshipType");

-- CreateIndex
CREATE INDEX "media_attachments_assetId_idx" ON "media_attachments"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ml_models_modelName_key" ON "ml_models"("modelName");

-- CreateIndex
CREATE UNIQUE INDEX "ml_models_modelName_modelVersion_key" ON "ml_models"("modelName", "modelVersion");

-- CreateIndex
CREATE INDEX "telemetry_ingest_events_deviceId_receivedAt_idx" ON "telemetry_ingest_events"("deviceId", "receivedAt");

-- CreateIndex
CREATE INDEX "telemetry_ingest_events_status_idx" ON "telemetry_ingest_events"("status");

-- CreateIndex
CREATE INDEX "asset_scan_logs_assetId_createdAt_idx" ON "asset_scan_logs"("assetId", "createdAt");

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentDepartmentId_fkey" FOREIGN KEY ("parentDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_amcProviderId_fkey" FOREIGN KEY ("amcProviderId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_cmcProviderId_fkey" FOREIGN KEY ("cmcProviderId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currentFacilityId_fkey" FOREIGN KEY ("currentFacilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currentBuildingId_fkey" FOREIGN KEY ("currentBuildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currentFloorId_fkey" FOREIGN KEY ("currentFloorId") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currentRoomId_fkey" FOREIGN KEY ("currentRoomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_homeLocationId_fkey" FOREIGN KEY ("homeLocationId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currentAssignedUserId_fkey" FOREIGN KEY ("currentAssignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currentAssignedDepartmentId_fkey" FOREIGN KEY ("currentAssignedDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_primaryCustodianId_fkey" FOREIGN KEY ("primaryCustodianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_custodianDepartmentId_fkey" FOREIGN KEY ("custodianDepartmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currentOperatorId_fkey" FOREIGN KEY ("currentOperatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_lastOperatorId_fkey" FOREIGN KEY ("lastOperatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_sensor_readings" ADD CONSTRAINT "iot_sensor_readings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictive_scores_history" ADD CONSTRAINT "predictive_scores_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_telemetry" ADD CONSTRAINT "asset_telemetry_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_history" ADD CONSTRAINT "maintenance_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_history" ADD CONSTRAINT "maintenance_history_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_history" ADD CONSTRAINT "maintenance_history_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_history" ADD CONSTRAINT "maintenance_history_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_escalatedToUserId_fkey" FOREIGN KEY ("escalatedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_assignedToDepartmentId_fkey" FOREIGN KEY ("assignedToDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_locationAtAssignment_fkey" FOREIGN KEY ("locationAtAssignment") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_fromFacilityId_fkey" FOREIGN KEY ("fromFacilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_toFacilityId_fkey" FOREIGN KEY ("toFacilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_fromRoomId_fkey" FOREIGN KEY ("fromRoomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_toRoomId_fkey" FOREIGN KEY ("toRoomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_history" ADD CONSTRAINT "transfer_history_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_childAssetId_fkey" FOREIGN KEY ("childAssetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_ingest_events" ADD CONSTRAINT "telemetry_ingest_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_scan_logs" ADD CONSTRAINT "asset_scan_logs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

