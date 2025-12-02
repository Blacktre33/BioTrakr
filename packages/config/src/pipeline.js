"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPipelineConfig = loadPipelineConfig;
const zod_1 = require("zod");
const PipelineConfigSchema = zod_1.z
    .object({
    TIMESCALE_URL: zod_1.z
        .string()
        .url("TIMESCALE_URL must be a valid connection URL.")
        .optional(),
    TELEMETRY_QUEUE_URL: zod_1.z.string().optional(),
    PIPELINE_BATCH_SIZE: zod_1.z.coerce.number().int().min(1).default(500),
    PIPELINE_POLL_INTERVAL_MS: zod_1.z.coerce.number().int().min(1000).default(5000),
})
    .transform((value) => {
    return {
        timescaleUrl: value.TIMESCALE_URL ?? null,
        telemetryQueueUrl: value.TELEMETRY_QUEUE_URL ?? null,
        batchSize: value.PIPELINE_BATCH_SIZE,
        pollIntervalMs: value.PIPELINE_POLL_INTERVAL_MS,
    };
});
let cached;
function loadPipelineConfig(env = process.env) {
    if (!cached) {
        cached = PipelineConfigSchema.parse(env);
    }
    return cached;
}
//# sourceMappingURL=pipeline.js.map