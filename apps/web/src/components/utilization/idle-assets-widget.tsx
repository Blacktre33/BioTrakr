'use client';

import { AlertTriangle, Clock } from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { IdleAsset } from '@/lib/api/utilization';

interface IdleAssetsWidgetProps {
  assets: IdleAsset[];
  isLoading?: boolean;
  maxItems?: number;
}

export function IdleAssetsWidget({ assets, isLoading, maxItems = 10 }: IdleAssetsWidgetProps) {
  if (isLoading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Underutilized Assets</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  const displayAssets = assets.slice(0, maxItems);

  if (displayAssets.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Underutilized Assets</h3>
        <div className="text-center py-8 text-gray-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No underutilized assets found</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Underutilized Assets</h3>
        <Badge variant="warning" size="sm">
          {assets.length} total
        </Badge>
      </div>
      <div className="space-y-3">
        {displayAssets.map((asset) => (
          <div
            key={asset.assetId}
            className="flex items-center justify-between p-3 bg-surface-200/30 rounded-lg border border-white/5 hover:bg-surface-200/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white truncate">{asset.equipmentName}</p>
                <Badge variant="neutral" size="sm">
                  {asset.category.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-xs text-gray-400">{asset.assetTag}</span>
                {asset.departmentName && (
                  <span className="text-xs text-gray-500">{asset.departmentName}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <div className="text-right">
                <p className="text-xs text-gray-400">Utilization</p>
                <p className={cn(
                  'text-sm font-semibold',
                  asset.utilizationPercentage < 10 ? 'text-critical-400' : 'text-warning-400'
                )}>
                  {asset.utilizationPercentage.toFixed(1)}%
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>{Math.round(asset.daysSinceLastUse)}d</span>
                </div>
                <p className="text-xs text-gray-500">idle</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {assets.length > maxItems && (
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-400">
            Showing {maxItems} of {assets.length} underutilized assets
          </p>
        </div>
      )}
    </Card>
  );
}

