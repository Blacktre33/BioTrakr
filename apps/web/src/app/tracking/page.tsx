'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout';
import { TrackingMap } from '@/components/tracking';
import { Card, Badge, Button } from '@/components/ui';
import { mockAssets, generateTelemetryData } from '@/lib/mock-data';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { Asset, TelemetryData } from '@/types';
import { Activity, MapPin, Signal, Battery, Thermometer, Clock, Filter, Download } from 'lucide-react';

export default function TrackingPage() {
  const [telemetry, setTelemetry] = useState<TelemetryData[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    setTelemetry(generateTelemetryData());
    
    const interval = setInterval(() => {
      setTelemetry(generateTelemetryData());
      setLastUpdate(new Date());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleAssetSelect = (asset: Asset) => {
    setSelectedAsset(asset);
  };

  const assetTelemetry = selectedAsset 
    ? telemetry.find(t => t.assetId === selectedAsset.id) 
    : null;

  return (
    <>
      <Header
        title="Real-Time Tracking"
        subtitle="Live asset location monitoring"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-200/50 rounded-lg">
              <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
              <span className="text-xs text-gray-400">
                Updated {formatRelativeTime(lastUpdate)}
              </span>
            </div>
            <Button variant="ghost" size="sm" leftIcon={<Filter className="w-4 h-4" />}>
              Filters
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<Download className="w-4 h-4" />}>
              Export
            </Button>
          </div>
        }
      />

      <div className="p-6">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Main Map */}
            <motion.div
              className="xl:col-span-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <TrackingMap
                assets={mockAssets}
                telemetry={telemetry}
                onAssetSelect={handleAssetSelect}
              />
            </motion.div>

            {/* Asset Details Panel */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-4"
            >
              {/* Selected Asset Details */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {selectedAsset ? 'Selected Asset' : 'Asset Details'}
                </h3>

                {selectedAsset ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-lg font-semibold text-white">{selectedAsset.name}</p>
                      <p className="text-sm text-gray-500">{selectedAsset.serialNumber}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-surface-200/30 rounded-xl">
                        <p className="text-xs text-gray-500 mb-1">Status</p>
                        <Badge
                          variant={
                            selectedAsset.status === 'operational' ? 'success' :
                            selectedAsset.status === 'critical' ? 'critical' : 'warning'
                          }
                          size="sm"
                          dot
                        >
                          {selectedAsset.status}
                        </Badge>
                      </div>
                      <div className="p-3 bg-surface-200/30 rounded-xl">
                        <p className="text-xs text-gray-500 mb-1">Risk Level</p>
                        <Badge
                          variant={
                            selectedAsset.riskLevel === 'low' ? 'success' :
                            selectedAsset.riskLevel === 'critical' ? 'critical' :
                            selectedAsset.riskLevel === 'high' ? 'warning' : 'primary'
                          }
                          size="sm"
                        >
                          {selectedAsset.riskLevel}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400 flex items-center gap-2">
                          <MapPin className="w-4 h-4" /> Location
                        </span>
                        <span className="text-sm text-white">
                          {selectedAsset.location.room}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400 flex items-center gap-2">
                          <Activity className="w-4 h-4" /> Building
                        </span>
                        <span className="text-sm text-white">
                          {selectedAsset.location.building}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400 flex items-center gap-2">
                          <Clock className="w-4 h-4" /> Floor
                        </span>
                        <span className="text-sm text-white">
                          {selectedAsset.location.floor}
                        </span>
                      </div>
                    </div>

                    {assetTelemetry && (
                      <>
                        <div className="border-t border-white/5 pt-4">
                          <p className="text-xs text-gray-500 mb-3">Telemetry Data</p>
                          <div className="space-y-2">
                            {assetTelemetry.battery && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-400 flex items-center gap-2">
                                  <Battery className="w-4 h-4" /> Battery
                                </span>
                                <span className={cn(
                                  'text-sm font-medium',
                                  assetTelemetry.battery > 50 ? 'text-success-500' :
                                  assetTelemetry.battery > 20 ? 'text-warning-500' : 'text-critical-500'
                                )}>
                                  {assetTelemetry.battery.toFixed(0)}%
                                </span>
                              </div>
                            )}
                            {assetTelemetry.signalStrength && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-400 flex items-center gap-2">
                                  <Signal className="w-4 h-4" /> Signal
                                </span>
                                <span className="text-sm text-white">
                                  {assetTelemetry.signalStrength.toFixed(0)} dBm
                                </span>
                              </div>
                            )}
                            {assetTelemetry.temperature && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-400 flex items-center gap-2">
                                  <Thermometer className="w-4 h-4" /> Temperature
                                </span>
                                <span className="text-sm text-white">
                                  {assetTelemetry.temperature.toFixed(1)}°C
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    <Button variant="secondary" className="w-full">
                      View Full Details
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <MapPin className="w-12 h-12 mx-auto text-gray-600 mb-3" />
                    <p className="text-gray-400">Select an asset on the map to view details</p>
                  </div>
                )}
              </Card>

              {/* Quick Stats */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Tracking Stats
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Active Trackers</span>
                    <span className="text-sm font-semibold text-white">{mockAssets.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Online</span>
                    <span className="text-sm font-semibold text-success-500">
                      {mockAssets.filter(a => a.status !== 'offline').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Low Battery</span>
                    <span className="text-sm font-semibold text-warning-500">3</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Out of Zone</span>
                    <span className="text-sm font-semibold text-critical-500">1</span>
                  </div>
                </div>
              </Card>

              {/* Recent Movement */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Recent Movement
                </h3>
                <div className="space-y-3">
                  {mockAssets.slice(0, 4).map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-200/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        asset.status === 'operational' ? 'bg-success-500' :
                        asset.status === 'critical' ? 'bg-critical-500' : 'bg-warning-500'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{asset.name}</p>
                        <p className="text-xs text-gray-500">{asset.location.room}</p>
                      </div>
                      <span className="text-xs text-gray-500">2m ago</span>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
    </>
  );
}
