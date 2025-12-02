'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, AlertTriangle, AlertCircle, Info, Check, X, Filter } from 'lucide-react';
import { Header } from '@/components/layout';
import { Card, Badge, Button } from '@/components/ui';
import { useAlertStore } from '@/stores';
import { mockAlerts } from '@/lib/mock-data';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function AlertsPage() {
  const { alerts, acknowledgeAlert, dismissAlert } = useAlertStore();
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical' | 'warning'>('all');
  
  // Use mock alerts if store is empty
  const displayAlerts = alerts.length > 0 ? alerts : mockAlerts;
  
  const filteredAlerts = displayAlerts.filter((alert) => {
    if (filter === 'unread') return !alert.acknowledged;
    if (filter === 'critical') return alert.type === 'critical';
    if (filter === 'warning') return alert.type === 'warning';
    return true;
  });

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-critical-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-warning-500" />;
      default:
        return <Info className="w-5 h-5 text-primary-400" />;
    }
  };

  const getAlertBadge = (type: string) => {
    switch (type) {
      case 'critical':
        return <Badge variant="critical">Critical</Badge>;
      case 'warning':
        return <Badge variant="warning">Warning</Badge>;
      default:
        return <Badge variant="primary">Info</Badge>;
    }
  };

  return (
    <>
      <Header
        title="Alerts & Notifications"
        subtitle="System alerts and important notifications"
      />

      <div className="p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Filter Buttons */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <div className="flex gap-2">
              {(['all', 'unread', 'critical', 'warning'] as const).map((filterType) => (
                <Button
                  key={filterType}
                  variant={filter === filterType ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setFilter(filterType)}
                >
                  {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {/* Alerts List */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {filteredAlerts.length} {filter === 'all' ? 'Total' : filter} Alert{filteredAlerts.length !== 1 ? 's' : ''}
              </h2>
            </div>
            <div className="space-y-3">
              {filteredAlerts.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="w-12 h-12 mx-auto mb-4 text-gray-500 opacity-50" />
                  <p className="text-gray-400">No alerts found</p>
                </div>
              ) : (
                filteredAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      'flex items-start gap-4 p-4 rounded-xl border border-white/5',
                      'hover:bg-surface-200/30 transition-colors',
                      !alert.acknowledged && 'bg-surface-200/20'
                    )}
                  >
                    <div className="mt-0.5">{getAlertIcon(alert.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1">
                          <h3 className="font-medium text-white">{alert.title}</h3>
                          <p className="text-sm text-gray-400 mt-1">{alert.message}</p>
                          {alert.asset && (
                            <p className="text-xs text-gray-500 mt-2">
                              Asset: {alert.asset.name}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {getAlertBadge(alert.type)}
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {formatRelativeTime(alert.timestamp)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {!alert.acknowledged && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => acknowledgeAlert(alert.id)}
                            leftIcon={<Check className="w-3 h-3" />}
                          >
                            Acknowledge
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => dismissAlert(alert.id)}
                          leftIcon={<X className="w-3 h-3" />}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </>
  );
}

