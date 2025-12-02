/**
 * Telemetry Event Validation Utilities
 * 
 * Implements validation rules from the Telemetry Labeling Guide to ensure
 * data quality and consistency across the BioTrakr telemetry pipeline.
 */

import type {
  TelemetryEvent,
  EventSeverity,
  HealthStatus,
  RiskClass,
  EventCategory,
  MLTrainingLabels,
} from "@biotrakr/types";

/**
 * Validation result structure
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valid enum values for validation
 */
const VALID_SEVERITIES: readonly EventSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

const VALID_HEALTH_STATUSES: readonly HealthStatus[] = [
  "critical",
  "poor",
  "fair",
  "good",
  "excellent",
] as const;

const VALID_RISK_CLASSES: readonly RiskClass[] = [
  "class_i",
  "class_ii",
  "class_iii",
] as const;

const VALID_EVENT_CATEGORIES: readonly EventCategory[] = [
  "location",
  "maintenance",
  "compliance",
  "operational",
  "system",
] as const;

const VALID_TELEMETRY_DOMAINS = [
  "asset",
  "rtls",
  "maintenance",
  "compliance",
  "user",
  "system",
  "ml",
] as const;

/**
 * Validates metric name follows naming convention: {domain}.{entity}.{action}.{metric_type}
 */
export function validateMetricName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Metric name must be a non-empty string" };
  }

  const parts = name.split(".");
  if (parts.length < 4) {
    return {
      valid: false,
      error: `Metric name must follow pattern domain.entity.action.metric_type, got ${parts.length} parts`,
    };
  }

  const [domain] = parts;
  if (!VALID_TELEMETRY_DOMAINS.includes(domain as any)) {
    return {
      valid: false,
      error: `Invalid domain '${domain}'. Must be one of: ${VALID_TELEMETRY_DOMAINS.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validates severity level
 */
export function validateSeverity(severity?: string): {
  valid: boolean;
  error?: string;
} {
  if (!severity) {
    return { valid: true }; // Optional field
  }

  if (!VALID_SEVERITIES.includes(severity as EventSeverity)) {
    return {
      valid: false,
      error: `Invalid severity: ${severity}. Must be one of: ${VALID_SEVERITIES.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validates health status
 */
export function validateHealthStatus(status?: string): {
  valid: boolean;
  error?: string;
} {
  if (!status) {
    return { valid: true }; // Optional field
  }

  if (!VALID_HEALTH_STATUSES.includes(status as HealthStatus)) {
    return {
      valid: false,
      error: `Invalid health_status: ${status}. Must be one of: ${VALID_HEALTH_STATUSES.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validates risk class
 */
export function validateRiskClass(riskClass?: string): {
  valid: boolean;
  error?: string;
} {
  if (!riskClass) {
    return { valid: true }; // Optional field
  }

  if (!VALID_RISK_CLASSES.includes(riskClass as RiskClass)) {
    return {
      valid: false,
      error: `Invalid risk_class: ${riskClass}. Must be one of: ${VALID_RISK_CLASSES.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validates event category
 */
export function validateEventCategory(category?: string): {
  valid: boolean;
  error?: string;
} {
  if (!category) {
    return { valid: true }; // Optional field
  }

  if (!VALID_EVENT_CATEGORIES.includes(category as EventCategory)) {
    return {
      valid: false,
      error: `Invalid event_category: ${category}. Must be one of: ${VALID_EVENT_CATEGORIES.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validates ML training labels
 */
export function validateMLLabels(labels?: MLTrainingLabels): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!labels) {
    return { valid: true, errors: [] }; // Optional field
  }

  // Validate health_score range (0-100)
  if (labels.health_score !== undefined) {
    if (
      typeof labels.health_score !== "number" ||
      labels.health_score < 0 ||
      labels.health_score > 100
    ) {
      errors.push(
        `health_score must be a number between 0 and 100, got: ${labels.health_score}`,
      );
    }
  }

  // Validate failure_probability range (0.0-1.0)
  if (labels.failure_probability !== undefined) {
    if (
      typeof labels.failure_probability !== "number" ||
      labels.failure_probability < 0 ||
      labels.failure_probability > 1
    ) {
      errors.push(
        `failure_probability must be a number between 0.0 and 1.0, got: ${labels.failure_probability}`,
      );
    }
  }

  // Validate label_confidence range (0.0-1.0)
  if (labels.label_confidence !== undefined) {
    if (
      typeof labels.label_confidence !== "number" ||
      labels.label_confidence < 0 ||
      labels.label_confidence > 1
    ) {
      errors.push(
        `label_confidence must be a number between 0.0 and 1.0, got: ${labels.label_confidence}`,
      );
    }
  }

  // Validate health_status enum
  if (labels.health_status) {
    const statusValidation = validateHealthStatus(labels.health_status);
    if (!statusValidation.valid) {
      errors.push(statusValidation.error!);
    }
  }

  // If health_score and health_status both present, check consistency
  if (
    labels.health_score !== undefined &&
    labels.health_status !== undefined
  ) {
    const score = labels.health_score;
    const expectedStatus =
      score <= 20
        ? "critical"
        : score <= 40
          ? "poor"
          : score <= 60
            ? "fair"
            : score <= 80
              ? "good"
              : "excellent";

    if (labels.health_status !== expectedStatus) {
      errors.push(
        `health_status '${labels.health_status}' inconsistent with health_score ${score} (expected '${expectedStatus}')`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a complete telemetry event according to labeling standards
 */
export function validateTelemetryEvent(
  event: Partial<TelemetryEvent>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields for all events
  if (!event.timestamp) {
    errors.push("Missing required field: timestamp");
  } else if (isNaN(Date.parse(event.timestamp))) {
    errors.push("Invalid timestamp format. Must be ISO 8601 string");
  }

  if (!event.facility_id) {
    errors.push("Missing required field: facility_id");
  }

  if (!event.service_name) {
    errors.push("Missing required field: service_name");
  }

  if (!event.environment) {
    errors.push("Missing required field: environment");
  }

  // Validate metric name if present
  if (event.name) {
    const nameValidation = validateMetricName(event.name);
    if (!nameValidation.valid) {
      errors.push(`Invalid metric name: ${nameValidation.error}`);
    }
  } else {
    warnings.push("Missing metric name (name field). Recommended for all events");
  }

  // Validate value if present
  if (event.value !== undefined) {
    if (typeof event.value !== "number" || !isFinite(event.value)) {
      errors.push("value must be a finite number");
    }
  }

  // Validate categorization fields
  if (event.severity) {
    const severityValidation = validateSeverity(event.severity);
    if (!severityValidation.valid) {
      errors.push(severityValidation.error!);
    }
  }

  if (event.event_category) {
    const categoryValidation = validateEventCategory(event.event_category);
    if (!categoryValidation.valid) {
      errors.push(categoryValidation.error!);
    }
  }

  if (event.risk_class) {
    const riskValidation = validateRiskClass(event.risk_class);
    if (!riskValidation.valid) {
      errors.push(riskValidation.error!);
    }
  }

  // Required fields for asset events
  if (event.asset_id || event.asset_category || event.asset_type) {
    if (!event.asset_id) {
      warnings.push(
        "asset_id recommended when asset_category or asset_type is present",
      );
    }
    if (!event.asset_category) {
      warnings.push(
        "asset_category recommended for asset-related events",
      );
    }
    if (!event.asset_type) {
      warnings.push("asset_type recommended for asset-related events");
    }
  }

  // Validate ML labels if present
  if (event.labels) {
    const labelsValidation = validateMLLabels(event.labels);
    if (!labelsValidation.valid) {
      errors.push(...labelsValidation.errors);
    }

    // If ML labels present, check for required provenance fields
    if (event.labels.label_source || event.labels.label_confidence) {
      if (!event.labels.label_source) {
        warnings.push(
          "label_source recommended when ML labels are present",
        );
      }
      if (event.labels.label_confidence === undefined) {
        warnings.push(
          "label_confidence recommended when ML labels are present",
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates multiple telemetry events in batch
 */
export function validateTelemetryEvents(
  events: Partial<TelemetryEvent>[],
): {
  valid: boolean;
  results: ValidationResult[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    totalErrors: number;
    totalWarnings: number;
  };
} {
  const results = events.map(validateTelemetryEvent);

  const valid = results.filter((r) => r.valid).length;
  const invalid = results.filter((r) => !r.valid).length;
  const totalErrors = results.reduce(
    (sum, r) => sum + r.errors.length,
    0,
  );
  const totalWarnings = results.reduce(
    (sum, r) => sum + r.warnings.length,
    0,
  );

  return {
    valid: invalid === 0,
    results,
    summary: {
      total: events.length,
      valid,
      invalid,
      totalErrors,
      totalWarnings,
    },
  };
}

/**
 * Helper to check if a string is a valid ISO 8601 timestamp
 */
export function isValidISOTimestamp(timestamp: string): boolean {
  try {
    const date = new Date(timestamp);
    return !isNaN(date.getTime()) && timestamp.includes("T");
  } catch {
    return false;
  }
}

/**
 * Helper to normalize health status from health score
 */
export function healthScoreToStatus(score: number): HealthStatus {
  if (score <= 20) return "critical";
  if (score <= 40) return "poor";
  if (score <= 60) return "fair";
  if (score <= 80) return "good";
  return "excellent";
}

/**
 * Helper to normalize time-to-failure category from hours
 */
export function hoursToFailureCategory(hours: number): string {
  if (hours <= 24) return "0-24h";
  if (hours <= 168) return "1-7d"; // 7 days = 168 hours
  if (hours <= 720) return "7-30d"; // 30 days = 720 hours
  return "30d+";
}

