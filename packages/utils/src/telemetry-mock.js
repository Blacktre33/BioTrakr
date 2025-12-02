"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMockTelemetryAssets = listMockTelemetryAssets;
exports.getMockAssetLocationPings = getMockAssetLocationPings;
exports.getLatestMockPing = getLatestMockPing;
exports.getMockMaintenanceTasks = getMockMaintenanceTasks;
exports.updateMockMaintenanceTaskStatus = updateMockMaintenanceTaskStatus;
exports.getMockTelemetryIngestEvents = getMockTelemetryIngestEvents;
exports.getMockMaintenanceEventLogs = getMockMaintenanceEventLogs;
const TELEMETRY_SEEDS = [
    {
        assetKey: "asset-alaris",
        assetId: "asset-alaris",
        baseLatitude: 42.3467,
        baseLongitude: -71.0972,
        status: "available",
    },
    {
        assetKey: "asset-monitor",
        assetId: "asset-monitor",
        baseLatitude: 42.3479,
        baseLongitude: -71.099,
        status: "in_use",
    },
    {
        assetKey: "asset-wheelchair",
        assetId: "asset-wheelchair",
        baseLatitude: 42.3454,
        baseLongitude: -71.0958,
        status: "maintenance",
    },
];
const MAINTENANCE_SEED = [
    {
        id: "maint-alaris",
        assetId: "asset-alaris",
        requestedById: "user-admin",
        assignedToId: "user-tech",
        status: "scheduled",
        priority: "high",
        summary: "Infusion pump preventive maintenance",
        details: "Run standard PM checklist and verify calibration.",
        scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: "maint-monitor",
        assetId: "asset-monitor",
        requestedById: "user-admin",
        assignedToId: "user-tech",
        status: "in_progress",
        priority: "medium",
        summary: "Monitor alarm investigation",
        details: "Nurse reported intermittent high-pressure alarm overnight.",
        scheduledFor: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: "maint-wheelchair",
        assetId: "asset-wheelchair",
        requestedById: "user-admin",
        assignedToId: null,
        status: "completed",
        priority: "low",
        summary: "Wheelchair caster replacement",
        details: "Front caster replaced and alignment verified.",
        scheduledFor: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];
function buildPing(seed, offsetMinutes, jitter) {
    const observedAt = new Date(Date.now() - offsetMinutes * 60 * 1000);
    const latitude = Number((seed.baseLatitude + jitter * 0.00025).toFixed(6));
    const longitude = Number((seed.baseLongitude + jitter * 0.00018).toFixed(6));
    const status = jitter % 3 === 0 ? "maintenance" : seed.status;
    return {
        id: `${seed.assetId}-${observedAt.getTime()}`,
        assetId: seed.assetId,
        latitude,
        longitude,
        status,
        observedAt: observedAt.toISOString(),
        metadata: {
            signalStrength: ["excellent", "good", "fair"][jitter % 3],
            batteryLevel: Math.max(20, 100 - jitter * 5),
        },
    };
}
function listMockTelemetryAssets() {
    return TELEMETRY_SEEDS.map((seed) => ({ ...seed }));
}
function getMockAssetLocationPings(assetId, count = 10) {
    const seed = TELEMETRY_SEEDS.find((item) => item.assetId === assetId || item.assetKey === assetId);
    if (!seed) {
        const fallback = {
            assetKey: assetId,
            assetId,
            baseLatitude: 42.3467,
            baseLongitude: -71.0972,
            status: "available",
        };
        return Array.from({ length: count }).map((_, index) => buildPing(fallback, index * 4, index));
    }
    return Array.from({ length: count }).map((_, index) => buildPing(seed, index * 4, index));
}
function getLatestMockPing(assetId) {
    return getMockAssetLocationPings(assetId, 1)[0];
}
function getMockMaintenanceTasks() {
    return MAINTENANCE_SEED.map((task) => ({ ...task }));
}
function updateMockMaintenanceTaskStatus(taskId, status) {
    return MAINTENANCE_SEED.map((task) => {
        if (task.id !== taskId) {
            return { ...task };
        }
        const next = {
            ...task,
            status,
            updatedAt: new Date().toISOString(),
            completedAt: status === "completed" ? new Date().toISOString() : task.completedAt,
        };
        return next;
    });
}
const TELEMETRY_EVENT_SEED = Array.from({
    length: 9,
}).map((_, index) => {
    const base = TELEMETRY_SEEDS[index % TELEMETRY_SEEDS.length];
    const receivedAt = new Date(Date.now() - index * 90 * 1000);
    const payload = {
        assetId: base.assetId,
        deviceId: `${base.assetKey}-device-0${index + 1}`,
        latitude: base.baseLatitude + index * 0.0001,
        longitude: base.baseLongitude - index * 0.0001,
        status: index % 4 === 0 ? "maintenance" : base.status,
        recordedAt: new Date(receivedAt.getTime() - 30 * 1000).toISOString(),
        metadata: {
            batteryLevel: Math.max(10, 100 - index * 7),
            signalStrength: ["excellent", "good", "fair", "poor"][index % 4],
        },
    };
    const isPending = index % 5 === 0;
    const processedAt = isPending
        ? null
        : new Date(receivedAt.getTime() + 20 * 1000).toISOString();
    return {
        id: `event-${index}`,
        assetId: base.assetId,
        deviceId: payload.deviceId,
        payload,
        receivedAt: receivedAt.toISOString(),
        processedAt,
        status: isPending ? "pending" : "processed",
    };
});
const MAINTENANCE_LOGS_SEED = MAINTENANCE_SEED.flatMap((task) => {
    const baseTime = new Date(task.createdAt);
    return [
        {
            id: `${task.id}-created`,
            maintenanceId: task.id,
            assetId: task.assetId,
            eventType: "created",
            payload: {
                requestedById: task.requestedById,
                summary: task.summary,
            },
            occurredAt: baseTime.toISOString(),
        },
        task.scheduledFor
            ? {
                id: `${task.id}-scheduled`,
                maintenanceId: task.id,
                assetId: task.assetId,
                eventType: "scheduled",
                payload: {
                    scheduledFor: task.scheduledFor,
                    priority: task.priority,
                },
                occurredAt: new Date(task.scheduledFor).toISOString(),
            }
            : null,
        task.completedAt
            ? {
                id: `${task.id}-completed`,
                maintenanceId: task.id,
                assetId: task.assetId,
                eventType: "completed",
                payload: {
                    details: task.details,
                },
                occurredAt: new Date(task.completedAt).toISOString(),
            }
            : null,
    ].filter(Boolean);
});
function getMockTelemetryIngestEvents() {
    return TELEMETRY_EVENT_SEED.map((event) => ({ ...event }));
}
function getMockMaintenanceEventLogs() {
    return MAINTENANCE_LOGS_SEED.map((log) => ({ ...log }));
}
//# sourceMappingURL=telemetry-mock.js.map