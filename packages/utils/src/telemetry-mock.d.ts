import type { AssetLocationPing, AssetStatus, MaintenanceEventLog, MaintenanceStatus, MaintenanceTask, TelemetryIngestEvent, Uuid } from "@biotrakr/types";
interface TelemetrySeed {
    assetKey: string;
    assetId: Uuid;
    baseLatitude: number;
    baseLongitude: number;
    status: AssetStatus;
}
export declare function listMockTelemetryAssets(): TelemetrySeed[];
export declare function getMockAssetLocationPings(assetId: string, count?: number): AssetLocationPing[];
export declare function getLatestMockPing(assetId: string): AssetLocationPing;
export declare function getMockMaintenanceTasks(): MaintenanceTask[];
export declare function updateMockMaintenanceTaskStatus(taskId: string, status: MaintenanceStatus): MaintenanceTask[];
export declare function getMockTelemetryIngestEvents(): TelemetryIngestEvent[];
export declare function getMockMaintenanceEventLogs(): MaintenanceEventLog[];
export {};
