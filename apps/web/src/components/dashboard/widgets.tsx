'use client';

import { motion } from 'framer-motion';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  Check,
  X,
  ChevronRight,
  Wrench,
  Box,
  MapPin,
  Shield,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Card, Badge, Button } from '@/components/ui';
import type { Alert, MaintenanceOrder } from '@/types';

// Alerts Widget
interface AlertsWidgetProps {
  alerts: Alert[];
  onAcknowledge?: (id: string) => void;
  onViewAll?: () => void;
}

export function AlertsWidget({ alerts, onAcknowledge, onViewAll }: AlertsWidgetProps) {
  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-critical-500" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-warning-500" />;
      default:
        return <Info className="w-4 h-4 text-primary-400" />;
    }
  };

  const getAlertBadge = (type: string) => {
    switch (type) {
      case 'critical':
        return <Badge variant="critical" size="sm" dot>Critical</Badge>;
      case 'warning':
        return <Badge variant="warning" size="sm" dot>Warning</Badge>;
      default:
        return <Badge variant="primary" size="sm" dot>Info</Badge>;
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Active Alerts</h3>
          <p className="text-sm text-gray-400 mt-0.5">
            {alerts.filter((a) => !a.acknowledged).length} unacknowledged
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onViewAll} rightIcon={<ChevronRight className="w-4 h-4" />}>
          View all
        </Button>
      </div>

      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="text-center py-8">
            <Check className="w-10 h-10 mx-auto text-success-500 mb-2" />
            <p className="text-gray-400">No active alerts</p>
          </div>
        ) : (
          alerts.slice(0, 4).map((alert, index) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                'p-4 rounded-xl border transition-all duration-200',
                alert.type === 'critical'
                  ? 'bg-critical-500/5 border-critical-500/20 hover:border-critical-500/40'
                  : alert.type === 'warning'
                  ? 'bg-warning-500/5 border-warning-500/20 hover:border-warning-500/40'
                  : 'bg-surface-200/30 border-white/5 hover:border-white/10'
              )}
            >
              <div className="flex gap-3">
                <div className="mt-0.5">{getAlertIcon(alert.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-white">{alert.title}</p>
                    {getAlertBadge(alert.type)}
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2 mb-2">{alert.message}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(alert.timestamp)}
                    </span>
                    {!alert.acknowledged && onAcknowledge && (
                      <button
                        onClick={() => onAcknowledge(alert.id)}
                        className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </Card>
  );
}

// Upcoming Maintenance Widget
interface MaintenanceWidgetProps {
  orders: MaintenanceOrder[];
  onViewAll?: () => void;
}

export function MaintenanceWidget({ orders, onViewAll }: MaintenanceWidgetProps) {
  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, 'success' | 'primary' | 'warning' | 'critical'> = {
      low: 'success',
      medium: 'primary',
      high: 'warning',
      urgent: 'critical',
    };
    return <Badge variant={variants[priority]} size="sm">{priority}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'accent' | 'primary' | 'success' | 'critical' | 'neutral'> = {
      scheduled: 'primary',
      in_progress: 'accent',
      completed: 'success',
      overdue: 'critical',
      cancelled: 'neutral',
    };
    const labels: Record<string, string> = {
      scheduled: 'Scheduled',
      in_progress: 'In Progress',
      completed: 'Completed',
      overdue: 'Overdue',
      cancelled: 'Cancelled',
    };
    return <Badge variant={variants[status]} size="sm">{labels[status]}</Badge>;
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Upcoming Maintenance</h3>
          <p className="text-sm text-gray-400 mt-0.5">
            {orders.filter((o) => o.status === 'scheduled').length} scheduled
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onViewAll} rightIcon={<ChevronRight className="w-4 h-4" />}>
          View all
        </Button>
      </div>

      <div className="space-y-3">
        {orders.slice(0, 4).map((order, index) => (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-4 rounded-xl bg-surface-200/30 border border-white/5 hover:border-white/10 transition-all duration-200 cursor-pointer group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-surface-300/50 group-hover:bg-primary-500/20 transition-colors">
                <Wrench className="w-4 h-4 text-gray-400 group-hover:text-primary-400 transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-white truncate">{order.title}</p>
                  {getPriorityBadge(order.priority)}
                </div>
                {order.asset && (
                  <p className="text-xs text-gray-500 mb-2 truncate">
                    {order.asset.name}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(order.status)}
                    <span className="text-xs text-gray-500">
                      {new Date(order.scheduledDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{order.assignedTo.split(' ')[0]}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

// Recent Activity Widget
interface Activity {
  id: string;
  type: 'asset' | 'maintenance' | 'tracking' | 'compliance';
  title: string;
  description: string;
  timestamp: string;
  user?: string;
}

interface ActivityWidgetProps {
  activities: Activity[];
}

export function ActivityWidget({ activities }: ActivityWidgetProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'asset':
        return <Box className="w-4 h-4 text-primary-400" />;
      case 'maintenance':
        return <Wrench className="w-4 h-4 text-accent-400" />;
      case 'tracking':
        return <MapPin className="w-4 h-4 text-warning-500" />;
      case 'compliance':
        return <Shield className="w-4 h-4 text-success-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
        <Button variant="ghost" size="sm" rightIcon={<ChevronRight className="w-4 h-4" />}>
          View all
        </Button>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-primary-500/50 via-surface-300 to-transparent" />

        <div className="space-y-4">
          {activities.map((activity, index) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative flex gap-4 pl-2"
            >
              {/* Timeline dot */}
              <div className="relative z-10 flex items-center justify-center w-5 h-5 rounded-full bg-surface-100 border border-white/10">
                <div className="w-2 h-2 rounded-full bg-primary-500" />
              </div>

              <div className="flex-1 pb-4">
                <div className="flex items-start gap-2 mb-1">
                  {getActivityIcon(activity.type)}
                  <p className="text-sm font-medium text-white">{activity.title}</p>
                </div>
                <p className="text-xs text-gray-400 mb-1">{activity.description}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(activity.timestamp)}
                  {activity.user && (
                    <>
                      <span>•</span>
                      <span>{activity.user}</span>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Card>
  );
}
