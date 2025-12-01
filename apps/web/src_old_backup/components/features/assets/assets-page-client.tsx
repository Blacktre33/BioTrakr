"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, FileSpreadsheet } from "lucide-react";
import { spacingScale } from "@biotrakr/ui";

import { AssetScanHistoryCard } from "@/components/features/assets/asset-scan-history-card";
import { AssetScanWorkflow } from "@/components/features/assets/asset-scan-workflow";
import { AssetsDataGrid } from "@/components/features/assets/assets-data-grid";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AssetsPageClient() {
  const [lastScannedAssetId, setLastScannedAssetId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Asset Inventory</CardTitle>
              <CardDescription>
                Search, filter, and review all assets synced from the BioTrakr platform.
              </CardDescription>
            </div>
            <Link href="/assets/data-entry">
              <Button variant="biotrakr" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Assets
              </Button>
            </Link>
          </div>
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


