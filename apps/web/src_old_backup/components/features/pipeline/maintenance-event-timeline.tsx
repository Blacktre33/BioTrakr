"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMockMaintenanceEventLogs, getMockMaintenanceTasks } from "@medasset/utils/telemetry-mock";

const ASSET_LOOKUP: Record<string, string> = {
  "asset-alaris": "Infusion Pump - Alaris",
  "asset-monitor": "Patient Monitor",
  "asset-wheelchair": "Wheelchair",
};

export function MaintenanceEventTimeline() {
  const logs = useMemo(() => getMockMaintenanceEventLogs(), []);
  const tasks = useMemo(() => getMockMaintenanceTasks(), []);
  const taskLookup = useMemo(
    () =>
      tasks.reduce<Record<string, (typeof tasks)[number]>>((accum, task) => {
        accum[task.id] = task;
        return accum;
      }, {}),
    [tasks],
  );

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
    [logs],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance Event Timeline</CardTitle>
      </CardHeader>
      <CardContent className="max-h-80 space-y-4 overflow-y-auto">
        <ol className="space-y-4">
          {sortedLogs.map((log) => {
            const task = taskLookup[log.maintenanceId];
            const formattedTimestamp = new Date(log.occurredAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <li key={log.id} className="space-y-1 border-l-2 border-muted-foreground/40 pl-4">
                <div className="text-xs text-muted-foreground">
                  {formattedTimestamp}
                </div>
                <div className="text-sm font-semibold capitalize">
                  {log.eventType.replace(/_/g, " ")}
                  {task ? ` – ${task.summary}` : ""}
                </div>
                <div className="text-sm text-muted-foreground">
                  {ASSET_LOOKUP[log.assetId] ?? log.assetId}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

