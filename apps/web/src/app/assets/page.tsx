'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Upload, Download, QrCode } from 'lucide-react';
import { Header } from '@/components/layout';
import { AssetTable } from '@/components/assets';
import { Button, Card } from '@/components/ui';
import { mockAssets } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import type { Asset } from '@/types';

export default function AssetsPage() {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const handleAssetSelect = (asset: Asset) => {
    setSelectedAsset(asset);
    console.log('Selected asset:', asset);
  };

  return (
    <>
      <Header
        title="Asset Registry"
        subtitle="Manage your healthcare equipment inventory"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" leftIcon={<Download className="w-4 h-4" />}>
              Export
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<Upload className="w-4 h-4" />}>
              Import
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<QrCode className="w-4 h-4" />}>
              Scan
            </Button>
          </div>
        }
      />

      <div className="p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <AssetTable
            assets={mockAssets}
            onAssetSelect={handleAssetSelect}
            onEdit={(asset) => console.log('Edit:', asset)}
            onDelete={(asset) => console.log('Delete:', asset)}
          />
        </motion.div>
      </div>
    </>
  );
}
