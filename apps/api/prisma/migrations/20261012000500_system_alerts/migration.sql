-- System alerts: problems with the installation itself (backups, disk
-- space, background jobs, outside messages), so administrators are told
-- when one starts, reminded while it lasts, and told when it is fixed.

-- CreateTable
CREATE TABLE "system_alerts" (
    "key" VARCHAR(100) NOT NULL,
    "severity" VARCHAR(10) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "detail" VARCHAR(1000),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastNotifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "system_alerts_resolvedAt_idx" ON "system_alerts"("resolvedAt");
