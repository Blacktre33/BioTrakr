export interface PipelineConfig {
    readonly timescaleUrl: string | null;
    readonly telemetryQueueUrl: string | null;
    readonly batchSize: number;
    readonly pollIntervalMs: number;
}
export declare function loadPipelineConfig(env?: Record<string, string | undefined>): PipelineConfig;
