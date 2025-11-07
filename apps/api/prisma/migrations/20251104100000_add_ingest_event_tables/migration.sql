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
CREATE TABLE "maintenance_event_logs" (
    "id" TEXT NOT NULL,
    "maintenanceId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telemetry_ingest_events_deviceId_receivedAt_idx" ON "telemetry_ingest_events"("deviceId", "receivedAt");

-- CreateIndex
CREATE INDEX "telemetry_ingest_events_status_idx" ON "telemetry_ingest_events"("status");

-- CreateIndex
CREATE INDEX "maintenance_event_logs_maintenanceId_idx" ON "maintenance_event_logs"("maintenanceId");

-- CreateIndex
CREATE INDEX "maintenance_event_logs_assetId_occurredAt_idx" ON "maintenance_event_logs"("assetId", "occurredAt");

-- AddForeignKey
ALTER TABLE "telemetry_ingest_events" ADD CONSTRAINT "telemetry_ingest_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_event_logs" ADD CONSTRAINT "maintenance_event_logs_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "maintenance_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_event_logs" ADD CONSTRAINT "maintenance_event_logs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

