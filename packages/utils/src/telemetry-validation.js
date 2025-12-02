"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMetricName = validateMetricName;
exports.validateSeverity = validateSeverity;
exports.validateHealthStatus = validateHealthStatus;
exports.validateRiskClass = validateRiskClass;
exports.validateEventCategory = validateEventCategory;
exports.validateMLLabels = validateMLLabels;
exports.validateTelemetryEvent = validateTelemetryEvent;
exports.validateTelemetryEvents = validateTelemetryEvents;
exports.isValidISOTimestamp = isValidISOTimestamp;
exports.healthScoreToStatus = healthScoreToStatus;
exports.hoursToFailureCategory = hoursToFailureCategory;
const VALID_SEVERITIES = [
    "critical",
    "high",
    "medium",
    "low",
    "info",
];
const VALID_HEALTH_STATUSES = [
    "critical",
    "poor",
    "fair",
    "good",
    "excellent",
];
const VALID_RISK_CLASSES = [
    "class_i",
    "class_ii",
    "class_iii",
];
const VALID_EVENT_CATEGORIES = [
    "location",
    "maintenance",
    "compliance",
    "operational",
    "system",
];
const VALID_TELEMETRY_DOMAINS = [
    "asset",
    "rtls",
    "maintenance",
    "compliance",
    "user",
    "system",
    "ml",
];
function validateMetricName(name) {
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
    if (!VALID_TELEMETRY_DOMAINS.includes(domain)) {
        return {
            valid: false,
            error: `Invalid domain '${domain}'. Must be one of: ${VALID_TELEMETRY_DOMAINS.join(", ")}`,
        };
    }
    return { valid: true };
}
function validateSeverity(severity) {
    if (!severity) {
        return { valid: true };
    }
    if (!VALID_SEVERITIES.includes(severity)) {
        return {
            valid: false,
            error: `Invalid severity: ${severity}. Must be one of: ${VALID_SEVERITIES.join(", ")}`,
        };
    }
    return { valid: true };
}
function validateHealthStatus(status) {
    if (!status) {
        return { valid: true };
    }
    if (!VALID_HEALTH_STATUSES.includes(status)) {
        return {
            valid: false,
            error: `Invalid health_status: ${status}. Must be one of: ${VALID_HEALTH_STATUSES.join(", ")}`,
        };
    }
    return { valid: true };
}
function validateRiskClass(riskClass) {
    if (!riskClass) {
        return { valid: true };
    }
    if (!VALID_RISK_CLASSES.includes(riskClass)) {
        return {
            valid: false,
            error: `Invalid risk_class: ${riskClass}. Must be one of: ${VALID_RISK_CLASSES.join(", ")}`,
        };
    }
    return { valid: true };
}
function validateEventCategory(category) {
    if (!category) {
        return { valid: true };
    }
    if (!VALID_EVENT_CATEGORIES.includes(category)) {
        return {
            valid: false,
            error: `Invalid event_category: ${category}. Must be one of: ${VALID_EVENT_CATEGORIES.join(", ")}`,
        };
    }
    return { valid: true };
}
function validateMLLabels(labels) {
    const errors = [];
    if (!labels) {
        return { valid: true, errors: [] };
    }
    if (labels.health_score !== undefined) {
        if (typeof labels.health_score !== "number" ||
            labels.health_score < 0 ||
            labels.health_score > 100) {
            errors.push(`health_score must be a number between 0 and 100, got: ${labels.health_score}`);
        }
    }
    if (labels.failure_probability !== undefined) {
        if (typeof labels.failure_probability !== "number" ||
            labels.failure_probability < 0 ||
            labels.failure_probability > 1) {
            errors.push(`failure_probability must be a number between 0.0 and 1.0, got: ${labels.failure_probability}`);
        }
    }
    if (labels.label_confidence !== undefined) {
        if (typeof labels.label_confidence !== "number" ||
            labels.label_confidence < 0 ||
            labels.label_confidence > 1) {
            errors.push(`label_confidence must be a number between 0.0 and 1.0, got: ${labels.label_confidence}`);
        }
    }
    if (labels.health_status) {
        const statusValidation = validateHealthStatus(labels.health_status);
        if (!statusValidation.valid) {
            errors.push(statusValidation.error);
        }
    }
    if (labels.health_score !== undefined &&
        labels.health_status !== undefined) {
        const score = labels.health_score;
        const expectedStatus = score <= 20
            ? "critical"
            : score <= 40
                ? "poor"
                : score <= 60
                    ? "fair"
                    : score <= 80
                        ? "good"
                        : "excellent";
        if (labels.health_status !== expectedStatus) {
            errors.push(`health_status '${labels.health_status}' inconsistent with health_score ${score} (expected '${expectedStatus}')`);
        }
    }
    return { valid: errors.length === 0, errors };
}
function validateTelemetryEvent(event) {
    const errors = [];
    const warnings = [];
    if (!event.timestamp) {
        errors.push("Missing required field: timestamp");
    }
    else if (isNaN(Date.parse(event.timestamp))) {
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
    if (event.name) {
        const nameValidation = validateMetricName(event.name);
        if (!nameValidation.valid) {
            errors.push(`Invalid metric name: ${nameValidation.error}`);
        }
    }
    else {
        warnings.push("Missing metric name (name field). Recommended for all events");
    }
    if (event.value !== undefined) {
        if (typeof event.value !== "number" || !isFinite(event.value)) {
            errors.push("value must be a finite number");
        }
    }
    if (event.severity) {
        const severityValidation = validateSeverity(event.severity);
        if (!severityValidation.valid) {
            errors.push(severityValidation.error);
        }
    }
    if (event.event_category) {
        const categoryValidation = validateEventCategory(event.event_category);
        if (!categoryValidation.valid) {
            errors.push(categoryValidation.error);
        }
    }
    if (event.risk_class) {
        const riskValidation = validateRiskClass(event.risk_class);
        if (!riskValidation.valid) {
            errors.push(riskValidation.error);
        }
    }
    if (event.asset_id || event.asset_category || event.asset_type) {
        if (!event.asset_id) {
            warnings.push("asset_id recommended when asset_category or asset_type is present");
        }
        if (!event.asset_category) {
            warnings.push("asset_category recommended for asset-related events");
        }
        if (!event.asset_type) {
            warnings.push("asset_type recommended for asset-related events");
        }
    }
    if (event.labels) {
        const labelsValidation = validateMLLabels(event.labels);
        if (!labelsValidation.valid) {
            errors.push(...labelsValidation.errors);
        }
        if (event.labels.label_source || event.labels.label_confidence) {
            if (!event.labels.label_source) {
                warnings.push("label_source recommended when ML labels are present");
            }
            if (event.labels.label_confidence === undefined) {
                warnings.push("label_confidence recommended when ML labels are present");
            }
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
function validateTelemetryEvents(events) {
    const results = events.map(validateTelemetryEvent);
    const valid = results.filter((r) => r.valid).length;
    const invalid = results.filter((r) => !r.valid).length;
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
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
function isValidISOTimestamp(timestamp) {
    try {
        const date = new Date(timestamp);
        return !isNaN(date.getTime()) && timestamp.includes("T");
    }
    catch {
        return false;
    }
}
function healthScoreToStatus(score) {
    if (score <= 20)
        return "critical";
    if (score <= 40)
        return "poor";
    if (score <= 60)
        return "fair";
    if (score <= 80)
        return "good";
    return "excellent";
}
function hoursToFailureCategory(hours) {
    if (hours <= 24)
        return "0-24h";
    if (hours <= 168)
        return "1-7d";
    if (hours <= 720)
        return "7-30d";
    return "30d+";
}
//# sourceMappingURL=telemetry-validation.js.map