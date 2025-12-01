import type { Metadata } from "next";

import { MaintenanceEventTimeline, PipelineConfigCard, TelemetryIngestTable } from "@/components/features/pipeline";

export const metadata: Metadata = {
  title: "Pipeline Monitor",
  description: "Monitor telemetry ingestion status and pipeline configuration.",
};

export default function PipelineMonitorPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <PipelineConfigCard />
        <TelemetryIngestTable />
      </div>
      <div className="xl:col-span-1">
        <MaintenanceEventTimeline />
      </div>
    </div>
  );
}

