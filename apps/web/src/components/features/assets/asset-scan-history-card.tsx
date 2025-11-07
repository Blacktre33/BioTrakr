"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssetScanLogs } from "@/lib/hooks/use-asset-scan-logs";

interface AssetScanHistoryCardProps {
  assetId?: string | null;
}

export function AssetScanHistoryCard({ assetId }: AssetScanHistoryCardProps) {
  const { data, isLoading, isError } = useAssetScanLogs(assetId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Asset Scans</CardTitle>
        <CardDescription>
          {assetId ? `Showing latest scans for asset ${assetId}` : "Scan an asset to see its recent history."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!assetId ? (
          <p className="text-sm text-muted-foreground">Use the scanner above to capture a QR code and track it here.</p>
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Unable to load scan history right now.</p>
        ) : data && data.length > 0 ? (
          // Render a simple list view instead of a full data grid to keep the dashboard lightweight.
          <ul className="space-y-3">
            {data.map((log) => (
              <li key={log.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{new Date(log.createdAt).toLocaleString()}</p>
                    <p className="mt-1 text-xs text-muted-foreground break-words">{log.qrPayload}</p>
                  </div>
                  {log.locationHint ? <Badge variant="outline">{log.locationHint}</Badge> : null}
                </div>
                {log.notes ? (
                  <p className="mt-2 text-sm text-muted-foreground">Notes: {log.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No scans recorded yet for this asset.</p>
        )}
      </CardContent>
    </Card>
  );
}


