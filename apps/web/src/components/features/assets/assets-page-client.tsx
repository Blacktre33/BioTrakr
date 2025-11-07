"use client";

import { useState } from "react";

import { AssetScanHistoryCard } from "@/components/features/assets/asset-scan-history-card";
import { AssetScanWorkflow } from "@/components/features/assets/asset-scan-workflow";
import { AssetsDataGrid } from "@/components/features/assets/assets-data-grid";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AssetsPageClient() {
  const [lastScannedAssetId, setLastScannedAssetId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Asset Inventory</CardTitle>
          <CardDescription>
            Search, filter, and review all assets synced from the MedAsset Pro platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AssetScanWorkflow onScanRecorded={setLastScannedAssetId} />
          <AssetsDataGrid />
        </CardContent>
      </Card>
      <AssetScanHistoryCard assetId={lastScannedAssetId} />
    </div>
  );
}


