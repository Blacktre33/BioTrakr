"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { loadPipelineConfig } from "@medasset/config";

function maskUrl(url: string | null) {
  if (!url) {
    return "Not configured";
  }

  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname !== "/" ? parsed.pathname : ""}`;
  } catch (error) {
    return "Configured";
  }
}

export function PipelineConfigCard() {
  const config = (() => {
    try {
      return loadPipelineConfig();
    } catch (error) {
      return null;
    }
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Configuration</CardTitle>
        <CardDescription>Environment snapshot for telemetry ingestion.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {!config ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Timescale URL</p>
              <p className="text-sm font-semibold">{maskUrl(config.timescaleUrl)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Telemetry Queue URL</p>
              <p className="text-sm font-semibold">{maskUrl(config.telemetryQueueUrl)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Batch Size</p>
              <p className="text-sm font-semibold">{config.batchSize}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Poll Interval (ms)</p>
              <p className="text-sm font-semibold">{config.pollIntervalMs}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

