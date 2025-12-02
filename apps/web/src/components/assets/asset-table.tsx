'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  QrCode,
  MapPin,
  Activity,
  Calendar,
  ScanLine,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { Card, Button, Badge, Input, ProgressBar } from '@/components/ui';
import type { Asset, AssetFilters, AssetStatus, AssetCategory, RiskLevel } from '@/types';

interface AssetTableProps {
  assets: Asset[];
  onAssetSelect?: (asset: Asset) => void;
  onEdit?: (asset: Asset) => void;
  onDelete?: (asset: Asset) => void;
}

export function AssetTable({ assets, onAssetSelect, onEdit, onDelete }: AssetTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof Asset>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<AssetFilters>({});
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const filteredAssets = useMemo(() => {
    let result = [...assets];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (asset) =>
          asset.name.toLowerCase().includes(query) ||
          asset.serialNumber.toLowerCase().includes(query) ||
          asset.manufacturer.toLowerCase().includes(query)
      );
    }

    if (filters.status?.length) {
      result = result.filter((asset) => filters.status!.includes(asset.status));
    }

    if (filters.category?.length) {
      result = result.filter((asset) => filters.category!.includes(asset.category));
    }

    if (filters.riskLevel?.length) {
      result = result.filter((asset) => filters.riskLevel!.includes(asset.riskLevel));
    }

    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const modifier = sortDirection === 'asc' ? 1 : -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * modifier;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * modifier;
      }
      return 0;
    });

    return result;
  }, [assets, searchQuery, filters, sortField, sortDirection]);

  const handleSort = (field: keyof Asset) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = () => {
    if (selectedRows.size === filteredAssets.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredAssets.map((a) => a.id)));
    }
  };

  const handleSelectRow = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const getStatusBadge = (status: AssetStatus) => {
    const variants: Record<AssetStatus, 'success' | 'warning' | 'critical' | 'neutral'> = {
      operational: 'success',
      maintenance: 'warning',
      critical: 'critical',
      offline: 'neutral',
      decommissioned: 'neutral',
    };
    return <Badge variant={variants[status]} size="sm" dot>{status}</Badge>;
  };

  const getCategoryBadge = (category: AssetCategory) => {
    const colors: Record<AssetCategory, string> = {
      diagnostic: 'bg-blue-500/20 text-blue-400',
      therapeutic: 'bg-purple-500/20 text-purple-400',
      monitoring: 'bg-green-500/20 text-green-400',
      surgical: 'bg-red-500/20 text-red-400',
      laboratory: 'bg-teal-500/20 text-teal-400',
      support: 'bg-gray-500/20 text-gray-400',
    };
    return (
      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', colors[category])}>
        {category}
      </span>
    );
  };

  const SortHeader = ({ field, children }: { field: keyof Asset; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-200 transition-colors"
    >
      {children}
      {sortField === field && (
        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      )}
    </button>
  );

  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              leftIcon={<Filter className="w-4 h-4" />}
            >
              Filters
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-4 flex flex-wrap gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-2">Status</p>
                  <div className="flex gap-1">
                    {(['operational', 'maintenance', 'critical', 'offline'] as AssetStatus[]).map((status) => (
                      <button
                        key={status}
                        onClick={() => {
                          const current = filters.status || [];
                          setFilters({
                            ...filters,
                            status: current.includes(status)
                              ? current.filter((s) => s !== status)
                              : [...current, status],
                          });
                        }}
                        className={cn(
                          'px-3 py-1.5 text-xs rounded-lg transition-all',
                          filters.status?.includes(status)
                            ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                            : 'bg-surface-200/50 text-gray-400 border border-transparent hover:bg-surface-300/50'
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setFilters({})}
                  className="self-end text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedRows.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-6 py-3 bg-primary-500/10 border-b border-primary-500/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-primary-400">
                {selectedRows.size} asset{selectedRows.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm">Export</Button>
                <Button variant="danger" size="sm">Delete</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="px-6 py-4 text-left">
                <input
                  type="checkbox"
                  checked={selectedRows.size === filteredAssets.length && filteredAssets.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-gray-600 bg-surface-200 text-primary-500"
                />
              </th>
              <th className="px-4 py-4 text-left"><SortHeader field="name">Asset</SortHeader></th>
              <th className="px-4 py-4 text-left"><SortHeader field="status">Status</SortHeader></th>
              <th className="px-4 py-4 text-left"><SortHeader field="category">Category</SortHeader></th>
              <th className="px-4 py-4 text-left"><span className="text-xs font-semibold text-gray-400 uppercase">Location</span></th>
              <th className="px-4 py-4 text-left"><SortHeader field="healthScore">Health</SortHeader></th>
              <th className="px-4 py-4 text-left"><SortHeader field="utilizationRate">Utilization</SortHeader></th>
              <th className="px-4 py-4 text-left"><span className="text-xs font-semibold text-gray-400 uppercase">Maintenance</span></th>
              <th className="px-4 py-4 text-right"><span className="text-xs font-semibold text-gray-400 uppercase">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.map((asset, index) => (
              <motion.tr
                key={asset.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  'border-b border-white/5 transition-colors',
                  selectedRows.has(asset.id) ? 'bg-primary-500/5' : 'hover:bg-surface-200/30'
                )}
              >
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(asset.id)}
                    onChange={() => handleSelectRow(asset.id)}
                    className="w-4 h-4 rounded border-gray-600 bg-surface-200 text-primary-500"
                  />
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onAssetSelect?.(asset)}>
                    <div className="w-10 h-10 rounded-lg bg-surface-200/50 flex items-center justify-center group-hover:bg-primary-500/20 transition-colors">
                      <Activity className="w-5 h-5 text-gray-400 group-hover:text-primary-400 transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white group-hover:text-primary-400 transition-colors">{asset.name}</p>
                      <p className="text-xs text-gray-500">{asset.serialNumber}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">{getStatusBadge(asset.status)}</td>
                <td className="px-4 py-4">{getCategoryBadge(asset.category)}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-300">{asset.location.room}</p>
                      <p className="text-xs text-gray-500">{asset.location.building}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="w-24">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        'text-sm font-semibold',
                        asset.healthScore >= 90 ? 'text-success-500' :
                        asset.healthScore >= 70 ? 'text-accent-400' :
                        asset.healthScore >= 50 ? 'text-warning-500' : 'text-critical-500'
                      )}>{asset.healthScore}%</span>
                    </div>
                    <ProgressBar value={asset.healthScore} size="sm" colorByValue />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="w-24">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-gray-300">{asset.utilizationRate}%</span>
                    </div>
                    <ProgressBar value={asset.utilizationRate} size="sm" />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-400">Next: {formatDate(asset.nextMaintenance, 'MMM d')}</p>
                      <p className="text-xs text-gray-500">Last: {formatDate(asset.lastMaintenance, 'MMM d')}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="relative">
                    <button
                      onClick={() => setActiveMenu(activeMenu === asset.id ? null : asset.id)}
                      className="p-2 text-gray-500 hover:text-gray-300 hover:bg-surface-200/50 rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {activeMenu === asset.id && (
                        <>
                          <motion.div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-0 mt-1 w-40 bg-surface-200 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50"
                          >
                            <button onClick={() => { onAssetSelect?.(asset); setActiveMenu(null); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-300/50">
                              <Eye className="w-4 h-4" /> View Details
                            </button>
                            <button onClick={() => { onEdit?.(asset); setActiveMenu(null); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-300/50">
                              <Edit className="w-4 h-4" /> Edit
                            </button>
                            <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-300/50">
                              <QrCode className="w-4 h-4" /> Show QR
                            </button>
                            <button onClick={() => { onDelete?.(asset); setActiveMenu(null); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-critical-500 hover:bg-critical-500/10">
                              <Trash2 className="w-4 h-4" /> Delete
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Showing <span className="font-medium text-white">{filteredAssets.length}</span> of <span className="font-medium text-white">{assets.length}</span> assets
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled>Previous</Button>
          <Button variant="ghost" size="sm">Next</Button>
        </div>
      </div>
    </Card>
  );
}
