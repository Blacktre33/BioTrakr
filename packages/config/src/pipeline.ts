import { z } from "zod";

const PipelineConfigSchema = z
  .object({
    TIMESCALE_URL: z
      .string()
      .url("TIMESCALE_URL must be a valid connection URL.")
      .optional(),
    TELEMETRY_QUEUE_URL: z.string().optional(),
    PIPELINE_BATCH_SIZE: z.coerce.number().int().min(1).default(500),
    PIPELINE_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  })
  .transform((value) => {
    return {
      timescaleUrl: value.TIMESCALE_URL ?? null,
      telemetryQueueUrl: value.TELEMETRY_QUEUE_URL ?? null,
      batchSize: value.PIPELINE_BATCH_SIZE,
      pollIntervalMs: value.PIPELINE_POLL_INTERVAL_MS,
    } satisfies PipelineConfig;
  });

export interface PipelineConfig {
  readonly timescaleUrl: string | null;
  readonly telemetryQueueUrl: string | null;
  readonly batchSize: number;
  readonly pollIntervalMs: number;
}

let cached: PipelineConfig | undefined;

export function loadPipelineConfig(
  env: Record<string, string | undefined> = process.env,
): PipelineConfig {
  if (!cached) {
    cached = PipelineConfigSchema.parse(env);
  }

  return cached;
}
