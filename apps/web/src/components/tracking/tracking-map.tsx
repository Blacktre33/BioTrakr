'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  RefreshCw,
  Activity,
  Wifi,
  Battery,
  Thermometer,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Card, Button, Badge, Input } from '@/components/ui';
import { useTrackingViewStore } from '@/stores';
import type { Asset, TelemetryData } from '@/types';

interface TrackingMapProps {
  assets: Asset[];
  telemetry: TelemetryData[];
  onAssetSelect?: (asset: Asset) => void;
}

export function TrackingMap({ assets, telemetry, onAssetSelect }: TrackingMapProps) {
  const { selectedFloor, setSelectedFloor, showBreadcrumbs, toggleBreadcrumbs } = useTrackingViewStore();
  const [zoom, setZoom] = useState(1);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Simulate real-time updates
  const [livePositions, setLivePositions] = useState(telemetry);

  useEffect(() => {
    const interval = setInterval(() => {
      setLivePositions((prev) =>
        prev.map((pos) => ({
          ...pos,
          location: {
            ...pos.location,
            x: pos.location.x + (Math.random() - 0.5) * 5,
            y: pos.location.y + (Math.random() - 0.5) * 5,
          },
        }))
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const floors = [
    { id: 1, name: 'Ground Floor' },
    { id: 2, name: 'Floor 1' },
    { id: 3, name: 'Floor 2' },
    { id: 4, name: 'Floor 3' },
  ];

  const zones = [
    { id: 'ER', name: 'Emergency', color: '#ef4444' },
    { id: 'ICU', name: 'ICU', color: '#f59e0b' },
    { id: 'OR', name: 'Surgery', color: '#22c55e' },
    { id: 'RAD', name: 'Radiology', color: '#3374ff' },
    { id: 'CARD', name: 'Cardiology', color: '#8b5cf6' },
    { id: 'LAB', name: 'Laboratory', color: '#25a99f' },
  ];

  const filteredPositions = livePositions.filter(
    (pos) => pos.location.floor === selectedFloor
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  const getStatusColor = (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return '#6b7280';
    switch (asset.status) {
      case 'operational':
        return '#22c55e';
      case 'maintenance':
        return '#f59e0b';
      case 'critical':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      {/* Map Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div>
          <h3 className="text-lg font-semibold text-white">Live Asset Tracking</h3>
          <p className="text-sm text-gray-400 mt-0.5">
            {filteredPositions.length} assets on {floors.find((f) => f.id === selectedFloor)?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            leftIcon={
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            }
          >
            Refresh
          </Button>
          <Button
            variant={showBreadcrumbs ? 'secondary' : 'ghost'}
            size="sm"
            onClick={toggleBreadcrumbs}
          >
            Trails
          </Button>
        </div>
      </div>

      <div className="flex">
        {/* Floor Selector */}
        <div className="w-48 border-r border-white/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Select Floor
          </p>
          {floors.map((floor) => (
            <button
              key={floor.id}
              onClick={() => setSelectedFloor(floor.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200',
                selectedFloor === floor.id
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'text-gray-400 hover:bg-surface-200/50 hover:text-gray-200 border border-transparent'
              )}
            >
              <Layers className="w-4 h-4" />
              {floor.name}
            </button>
          ))}

          <div className="pt-4 mt-4 border-t border-white/5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Zones
            </p>
            <div className="space-y-2">
              {zones.map((zone) => (
                <div key={zone.id} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: zone.color }}
                  />
                  <span className="text-xs text-gray-400">{zone.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Map Area */}
        <div className="flex-1 relative">
          {/* Map Canvas */}
          <div
            className="relative w-full h-[500px] bg-surface-200/30 overflow-hidden"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          >
            {/* Grid background */}
            <div className="absolute inset-0 grid-lines opacity-30" />

            {/* Zone overlays */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 600 500">
              {/* ER Zone */}
              <rect x="20" y="20" width="150" height="120" fill="#ef4444" fillOpacity="0.1" stroke="#ef4444" strokeOpacity="0.3" rx="8" />
              <text x="95" y="85" textAnchor="middle" fill="#ef4444" fontSize="12" fontWeight="600">ER</text>

              {/* ICU Zone */}
              <rect x="190" y="20" width="180" height="120" fill="#f59e0b" fillOpacity="0.1" stroke="#f59e0b" strokeOpacity="0.3" rx="8" />
              <text x="280" y="85" textAnchor="middle" fill="#f59e0b" fontSize="12" fontWeight="600">ICU</text>

              {/* Surgery Zone */}
              <rect x="390" y="20" width="190" height="200" fill="#22c55e" fillOpacity="0.1" stroke="#22c55e" strokeOpacity="0.3" rx="8" />
              <text x="485" y="120" textAnchor="middle" fill="#22c55e" fontSize="12" fontWeight="600">Surgery</text>

              {/* Radiology Zone */}
              <rect x="20" y="160" width="180" height="150" fill="#3374ff" fillOpacity="0.1" stroke="#3374ff" strokeOpacity="0.3" rx="8" />
              <text x="110" y="240" textAnchor="middle" fill="#3374ff" fontSize="12" fontWeight="600">Radiology</text>

              {/* Laboratory Zone */}
              <rect x="220" y="160" width="150" height="150" fill="#25a99f" fillOpacity="0.1" stroke="#25a99f" strokeOpacity="0.3" rx="8" />
              <text x="295" y="240" textAnchor="middle" fill="#25a99f" fontSize="12" fontWeight="600">Laboratory</text>

              {/* Cardiology Zone */}
              <rect x="20" y="330" width="280" height="150" fill="#8b5cf6" fillOpacity="0.1" stroke="#8b5cf6" strokeOpacity="0.3" rx="8" />
              <text x="160" y="410" textAnchor="middle" fill="#8b5cf6" fontSize="12" fontWeight="600">Cardiology</text>
            </svg>

            {/* Asset markers */}
            <AnimatePresence>
              {filteredPositions.map((pos) => {
                const asset = assets.find((a) => a.id === pos.assetId);
                const isSelected = selectedAssetId === pos.assetId;

                return (
                  <motion.div
                    key={pos.assetId}
                    className="absolute cursor-pointer"
                    style={{
                      left: pos.location.x,
                      top: pos.location.y,
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: 1,
                      opacity: 1,
                      x: pos.location.x,
                      y: pos.location.y,
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    onClick={() => {
                      setSelectedAssetId(isSelected ? null : pos.assetId);
                      if (asset && onAssetSelect) {
                        onAssetSelect(asset);
                      }
                    }}
                  >
                    {/* Ping animation for critical assets */}
                    {asset?.status === 'critical' && (
                      <span
                        className="absolute -inset-2 rounded-full animate-ping"
                        style={{ backgroundColor: `${getStatusColor(pos.assetId)}30` }}
                      />
                    )}

                    {/* Marker */}
                    <div
                      className={cn(
                        'relative w-4 h-4 rounded-full border-2 border-white shadow-lg transition-transform',
                        isSelected && 'scale-150'
                      )}
                      style={{ backgroundColor: getStatusColor(pos.assetId) }}
                    />

                    {/* Breadcrumb trail */}
                    {showBreadcrumbs && (
                      <div className="absolute -z-10">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className="absolute w-2 h-2 rounded-full opacity-20"
                            style={{
                              backgroundColor: getStatusColor(pos.assetId),
                              left: -10 - i * 8,
                              top: 5 + i * 3,
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Tooltip */}
                    {isSelected && asset && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute left-6 top-0 z-50 w-64 p-4 bg-surface-100 border border-white/10 rounded-xl shadow-xl"
                      >
                        <p className="font-semibold text-white text-sm mb-1">{asset.name}</p>
                        <p className="text-xs text-gray-400 mb-3">{asset.serialNumber}</p>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Activity className="w-3 h-3" /> Status
                            </span>
                            <Badge
                              variant={
                                asset.status === 'operational'
                                  ? 'success'
                                  : asset.status === 'critical'
                                  ? 'critical'
                                  : 'warning'
                              }
                              size="sm"
                            >
                              {asset.status}
                            </Badge>
                          </div>

                          {pos.battery && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Battery className="w-3 h-3" /> Battery
                              </span>
                              <span className="text-xs text-gray-300">{pos.battery.toFixed(0)}%</span>
                            </div>
                          )}

                          {pos.signalStrength && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Wifi className="w-3 h-3" /> Signal
                              </span>
                              <span className="text-xs text-gray-300">{pos.signalStrength.toFixed(0)} dBm</span>
                            </div>
                          )}

                          {pos.temperature && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Thermometer className="w-3 h-3" /> Temp
                              </span>
                              <span className="text-xs text-gray-300">{pos.temperature.toFixed(1)}°C</span>
                            </div>
                          )}
                        </div>

                        <p className="text-xs text-gray-500 mt-3">
                          {asset.location.building}, {asset.location.room}
                        </p>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Zoom Controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-surface-200/80 backdrop-blur rounded-xl p-1">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.2, 2))}
              className="p-2 text-gray-400 hover:text-white hover:bg-surface-300/50 rounded-lg transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))}
              className="p-2 text-gray-400 hover:text-white hover:bg-surface-300/50 rounded-lg transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-2 text-gray-400 hover:text-white hover:bg-surface-300/50 rounded-lg transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 flex items-center gap-4 bg-surface-200/80 backdrop-blur rounded-xl px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-success-500" />
              <span className="text-xs text-gray-400">Operational</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-warning-500" />
              <span className="text-xs text-gray-400">Maintenance</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-critical-500 animate-pulse" />
              <span className="text-xs text-gray-400">Critical</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
