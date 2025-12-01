'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Search,
  Plus,
  ChevronDown,
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
  Clock,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useAlertStore } from '@/stores';
import { mockAlerts } from '@/lib/mock-data';
import { Button, Avatar, Badge } from '@/components/ui';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { alerts, acknowledgeAlert, dismissAlert } = useAlertStore();

  // Use mock alerts if store is empty
  const displayAlerts = alerts.length > 0 ? alerts : mockAlerts;
  const unreadAlerts = displayAlerts.filter((a) => !a.acknowledged);

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

  const quickAddOptions = [
    { label: 'New Asset', icon: Plus, href: '/assets/new' },
    { label: 'Work Order', icon: Plus, href: '/maintenance/new' },
    { label: 'QR Scan', icon: Plus, href: '/scan' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-surface-0/80 backdrop-blur-xl border-b border-white/5">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left: Title */}
        <div>
          <h1 className="text-2xl font-bold text-white font-display">{title}</h1>
          {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {actions}

          {/* Quick Add */}
          <div className="relative">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowQuickAdd(!showQuickAdd)}
              leftIcon={<Plus className="w-4 h-4" />}
              rightIcon={<ChevronDown className={cn('w-4 h-4 transition-transform', showQuickAdd && 'rotate-180')} />}
            >
              Quick Add
            </Button>

            <AnimatePresence>
              {showQuickAdd && (
                <>
                  <motion.div
                    className="fixed inset-0 z-40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowQuickAdd(false)}
                  />
                  <motion.div
                    className="absolute right-0 mt-2 w-48 bg-surface-100 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50"
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    {quickAddOptions.map((option) => (
                      <a
                        key={option.label}
                        href={option.href}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-surface-200/50 hover:text-white transition-colors"
                      >
                        <option.icon className="w-4 h-4" />
                        {option.label}
                      </a>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={cn(
                'relative p-2.5 rounded-xl transition-all duration-200',
                showNotifications
                  ? 'bg-primary-500/20 text-primary-400'
                  : 'text-gray-400 hover:bg-surface-200/50 hover:text-gray-200'
              )}
            >
              <Bell className="w-5 h-5" />
              {unreadAlerts.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-critical-500 rounded-full" />
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <>
                  <motion.div
                    className="fixed inset-0 z-40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowNotifications(false)}
                  />
                  <motion.div
                    className="absolute right-0 mt-2 w-96 bg-surface-100 border border-white/10 rounded-2xl shadow-xl overflow-hidden z-50"
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">Notifications</h3>
                        {unreadAlerts.length > 0 && (
                          <Badge variant="critical" size="sm">
                            {unreadAlerts.length} new
                          </Badge>
                        )}
                      </div>
                      <button
                        onClick={() => setShowNotifications(false)}
                        className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Alerts List */}
                    <div className="max-h-96 overflow-y-auto">
                      {displayAlerts.length === 0 ? (
                        <div className="py-8 text-center text-gray-500">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No notifications</p>
                        </div>
                      ) : (
                        displayAlerts.slice(0, 5).map((alert) => (
                          <div
                            key={alert.id}
                            className={cn(
                              'px-4 py-3 border-b border-white/5 hover:bg-surface-200/30 transition-colors',
                              !alert.acknowledged && 'bg-surface-200/20'
                            )}
                          >
                            <div className="flex gap-3">
                              <div className="mt-0.5">{getAlertIcon(alert.type)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium text-white">{alert.title}</p>
                                  <span className="text-xs text-gray-500 whitespace-nowrap">
                                    {formatRelativeTime(alert.timestamp)}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                                  {alert.message}
                                </p>
                                {alert.asset && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Asset: {alert.asset.name}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  {!alert.acknowledged && (
                                    <button
                                      onClick={() => acknowledgeAlert(alert.id)}
                                      className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                                    >
                                      <Check className="w-3 h-3" />
                                      Acknowledge
                                    </button>
                                  )}
                                  <button
                                    onClick={() => dismissAlert(alert.id)}
                                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Footer */}
                    {displayAlerts.length > 0 && (
                      <div className="px-4 py-3 border-t border-white/5">
                        <a
                          href="/alerts"
                          className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                        >
                          View all notifications →
                        </a>
                      </div>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* User Avatar */}
          <button className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-surface-200/50 transition-colors">
            <Avatar name="Dr. Sarah Chen" size="sm" />
          </button>
        </div>
      </div>
    </header>
  );
}
