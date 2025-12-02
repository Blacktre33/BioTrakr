'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Clock } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { AssetUtilization } from '@/lib/api/utilization';

interface AssetUtilizationTableProps {
  data: AssetUtilization[];
  isLoading?: boolean;
  onAssetClick?: (assetId: string) => void;
}

type SortField = 'equipmentName' | 'utilizationPercentage' | 'usageHours' | 'sessionCount' | 'lastUsedAt';
type SortDirection = 'asc' | 'desc';

export function AssetUtilizationTable({
  data,
  isLoading,
  onAssetClick,
}: AssetUtilizationTableProps) {
  const [sortField, setSortField] = useState<SortField>('utilizationPercentage');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedData = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'equipmentName':
          aValue = a.equipmentName.toLowerCase();
          bValue = b.equipmentName.toLowerCase();
          break;
        case 'utilizationPercentage':
          aValue = a.utilizationPercentage;
          bValue = b.utilizationPercentage;
          break;
        case 'usageHours':
          aValue = a.usageHours;
          bValue = b.usageHours;
          break;
        case 'sessionCount':
          aValue = a.sessionCount;
          bValue = b.sessionCount;
          break;
        case 'lastUsedAt':
          aValue = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
          bValue = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [data, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-500" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 ml-1 text-primary-400" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 text-primary-400" />
    );
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Asset Utilization</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Asset Utilization</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left py-3 px-4">
                <button
                  onClick={() => handleSort('equipmentName')}
                  className="flex items-center text-xs font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Asset Name
                  <SortIcon field="equipmentName" />
                </button>
              </th>
              <th className="text-left py-3 px-4">
                <span className="text-xs font-medium text-gray-400">Category</span>
              </th>
              <th className="text-right py-3 px-4">
                <button
                  onClick={() => handleSort('utilizationPercentage')}
                  className="flex items-center justify-end ml-auto text-xs font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Utilization
                  <SortIcon field="utilizationPercentage" />
                </button>
              </th>
              <th className="text-right py-3 px-4">
                <button
                  onClick={() => handleSort('usageHours')}
                  className="flex items-center justify-end ml-auto text-xs font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Usage Hours
                  <SortIcon field="usageHours" />
                </button>
              </th>
              <th className="text-right py-3 px-4">
                <button
                  onClick={() => handleSort('sessionCount')}
                  className="flex items-center justify-end ml-auto text-xs font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Sessions
                  <SortIcon field="sessionCount" />
                </button>
              </th>
              <th className="text-right py-3 px-4">
                <button
                  onClick={() => handleSort('lastUsedAt')}
                  className="flex items-center justify-end ml-auto text-xs font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Last Used
                  <SortIcon field="lastUsedAt" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((asset) => (
              <tr
                key={asset.assetId}
                className={cn(
                  'border-b border-white/5 hover:bg-surface-200/30 transition-colors',
                  onAssetClick && 'cursor-pointer'
                )}
                onClick={() => onAssetClick?.(asset.assetId)}
              >
                <td className="py-3 px-4">
                  <div>
                    <p className="text-sm font-medium text-white">{asset.equipmentName}</p>
                    <p className="text-xs text-gray-500">{asset.assetTag}</p>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className="text-xs text-gray-400">
                    {asset.category.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 bg-gray-700 rounded-full h-2">
                      <div
                        className={cn(
                          'h-2 rounded-full',
                          asset.utilizationPercentage >= 80
                            ? 'bg-success-400'
                            : asset.utilizationPercentage >= 50
                            ? 'bg-primary-400'
                            : asset.utilizationPercentage >= 30
                            ? 'bg-warning-400'
                            : 'bg-critical-400'
                        )}
                        style={{ width: `${Math.min(100, asset.utilizationPercentage)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-white w-12 text-right">
                      {asset.utilizationPercentage.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="text-sm text-gray-300">{asset.usageHours.toFixed(1)}</span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="text-sm text-gray-300">{asset.sessionCount}</span>
                </td>
                <td className="py-3 px-4 text-right">
                  {asset.lastUsedAt ? (
                    <div className="flex items-center justify-end gap-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(asset.lastUsedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">Never</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sortedData.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">No utilization data available</p>
        </div>
      )}
    </Card>
  );
}

