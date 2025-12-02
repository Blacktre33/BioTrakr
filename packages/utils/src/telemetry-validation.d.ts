import type { TelemetryEvent, HealthStatus, MLTrainingLabels } from "@biotrakr/types";
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export declare function validateMetricName(name: string): {
    valid: boolean;
    error?: string;
};
export declare function validateSeverity(severity?: string): {
    valid: boolean;
    error?: string;
};
export declare function validateHealthStatus(status?: string): {
    valid: boolean;
    error?: string;
};
export declare function validateRiskClass(riskClass?: string): {
    valid: boolean;
    error?: string;
};
export declare function validateEventCategory(category?: string): {
    valid: boolean;
    error?: string;
};
export declare function validateMLLabels(labels?: MLTrainingLabels): {
    valid: boolean;
    errors: string[];
};
export declare function validateTelemetryEvent(event: Partial<TelemetryEvent>): ValidationResult;
export declare function validateTelemetryEvents(events: Partial<TelemetryEvent>[]): {
    valid: boolean;
    results: ValidationResult[];
    summary: {
        total: number;
        valid: number;
        invalid: number;
        totalErrors: number;
        totalWarnings: number;
    };
};
export declare function isValidISOTimestamp(timestamp: string): boolean;
export declare function healthScoreToStatus(score: number): HealthStatus;
export declare function hoursToFailureCategory(hours: number): string;
