'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Upload, Download, QrCode } from 'lucide-react';
import { Header } from '@/components/layout';
import { AssetTable, AssetCreateForm, AssetExcelImport, AssetScanWorkflow } from '@/components/assets';
import { Button, Card } from '@/components/ui';
import { useAssets, useImportAssetsMutation, useCreateAssetMutation } from '@/lib/hooks/use-assets';
import { useCreateAssetScanMutation } from '@/lib/hooks/use-asset-scan-logs';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adaptApiAssetsToUi } from '@/lib/utils/asset-adapter';
import type { Asset } from '@/types';

export default function AssetsPage() {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Fetch assets from API
  const { data: apiAssets = [], isLoading, error, refetch } = useAssets({
    take: 100, // Adjust pagination as needed
  });

  // Convert API assets to UI format
  const assets = adaptApiAssetsToUi(apiAssets);

  // Import mutation
  const importMutation = useImportAssetsMutation();

  // Create asset mutation
  const createAssetMutation = useCreateAssetMutation();

  // Create scan mutation
  const createScanMutation = useCreateAssetScanMutation();

  useEffect(() => {
    // Open scan dialog if scan=true query param is present
    if (searchParams.get('scan') === 'true') {
      setShowScanDialog(true);
    }
  }, [searchParams]);

  const handleAssetSelect = (asset: Asset) => {
    setSelectedAsset(asset);
    console.log('Selected asset:', asset);
  };

  const handleImportComplete = (result: { imported: number; failed: number; totalRows: number }) => {
    if (result.imported > 0) {
      toast.success(`Successfully imported ${result.imported} of ${result.totalRows} assets`);
      // Assets list will automatically refresh due to cache invalidation in the mutation
    } else {
      toast.error(`Failed to import assets. ${result.failed} errors occurred.`);
    }
  };

  const handleScanRecorded = (assetId: string) => {
    toast.success('Scan recorded successfully');
    setShowScanDialog(false);
    // Invalidate assets list to refresh scan counts
    queryClient.invalidateQueries({ queryKey: ['assets'] });
    // Optionally navigate to asset details
    // router.push(`/assets/${assetId}`);
  };

  const handleAssetCreated = () => {
    toast.success('Asset created successfully');
    // Assets list will automatically refresh due to cache invalidation in the mutation
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const isNetworkError = errorMessage.includes('Cannot connect to API server') || errorMessage.includes('Network Error');
    
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/50 p-6 text-red-800 dark:text-red-200">
          <p className="font-semibold text-lg mb-2">Error loading assets</p>
          <p className="text-sm mb-4">{errorMessage}</p>
          
          {isNetworkError && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-sm font-medium mb-2">To fix this issue:</p>
              <ol className="list-decimal list-inside text-sm space-y-1 ml-2">
                <li>Make sure the API server is running</li>
                <li>Start it with: <code className="bg-red-200 dark:bg-red-900 px-1 py-0.5 rounded">cd apps/api && pnpm dev</code></li>
                <li>The API should be available at <code className="bg-red-200 dark:bg-red-900 px-1 py-0.5 rounded">http://localhost:3001</code></li>
              </ol>
            </div>
          )}
          
          <div className="mt-4 flex gap-2">
            <Button onClick={() => refetch()} variant="primary">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header
        title="Asset Registry"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" leftIcon={<Download className="w-4 h-4" />}>
              Export
            </Button>
            <AssetExcelImport
              onImportComplete={handleImportComplete}
            />
            <Button 
              variant="ghost" 
              size="sm" 
              leftIcon={<QrCode className="w-4 h-4" />}
              onClick={() => setShowScanDialog(true)}
            >
              Scan
            </Button>
            <AssetScanWorkflow
              open={showScanDialog}
              onOpenChange={setShowScanDialog}
              onScanRecorded={handleScanRecorded}
            />
          </div>
        }
      />

      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading assets...</div>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <AssetTable
              assets={assets}
              onAssetSelect={handleAssetSelect}
              onEdit={(asset) => console.log('Edit:', asset)}
              onDelete={(asset) => console.log('Delete:', asset)}
            />
          </motion.div>
        )}
      </div>

      {/* Asset Create Form Dialog */}
      <AssetCreateForm
        onAssetCreated={handleAssetCreated}
      />
    </>
  );
}
