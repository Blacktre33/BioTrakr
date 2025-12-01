'use client';

import { motion } from 'framer-motion';
import {
  Box,
  Activity,
  Wrench,
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Percent,
} from 'lucide-react';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import type { DashboardMetrics } from '@/types';

interface MetricCardsProps {
  metrics: DashboardMetrics;
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const cards = [
    {
      title: 'Total Assets',
      value: formatNumber(metrics.totalAssets),
      change: metrics.assetsChange,
      changeLabel: 'from last month',
      icon: Box,
      color: 'primary' as const,
      gradient: 'from-primary-500 to-primary-600',
    },
    {
      title: 'Operational',
      value: formatNumber(metrics.operationalAssets),
      change: metrics.operationalChange,
      changeLabel: 'availability rate',
      icon: Activity,
      color: 'success' as const,
      gradient: 'from-success-500 to-success-600',
    },
    {
      title: 'Maintenance Due',
      value: formatNumber(metrics.maintenanceDue),
      change: metrics.maintenanceChange,
      changeLabel: 'from last week',
      icon: Wrench,
      color: 'warning' as const,
      gradient: 'from-warning-500 to-warning-600',
    },
    {
      title: 'Compliance Rate',
      value: formatPercent(metrics.complianceRate),
      change: metrics.complianceChange,
      changeLabel: 'from last audit',
      icon: Shield,
      color: 'accent' as const,
      gradient: 'from-accent-500 to-accent-600',
    },
    {
      title: 'Avg Utilization',
      value: formatPercent(metrics.averageUtilization),
      change: metrics.utilizationChange,
      changeLabel: 'this quarter',
      icon: Percent,
      color: 'primary' as const,
      gradient: 'from-primary-400 to-accent-500',
    },
    {
      title: 'Critical Alerts',
      value: formatNumber(metrics.criticalAlerts),
      change: metrics.alertsChange,
      changeLabel: 'active alerts',
      icon: AlertTriangle,
      color: 'critical' as const,
      gradient: 'from-critical-500 to-critical-600',
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        const isPositive = card.change >= 0;
        const TrendIcon = isPositive ? TrendingUp : TrendingDown;

        return (
          <motion.div
            key={card.title}
            variants={itemVariants}
            className="relative overflow-hidden rounded-2xl bg-surface-100/50 backdrop-blur-xl border border-white/5 p-5 group hover:border-white/10 transition-all duration-300"
          >
            {/* Accent line */}
            <div className={cn('absolute top-0 left-0 w-full h-1 bg-gradient-to-r', card.gradient)} />

            {/* Glow effect on hover */}
            <div
              className={cn(
                'absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl',
                card.color === 'primary' && 'bg-primary-500/20',
                card.color === 'success' && 'bg-success-500/20',
                card.color === 'warning' && 'bg-warning-500/20',
                card.color === 'accent' && 'bg-accent-500/20',
                card.color === 'critical' && 'bg-critical-500/20'
              )}
              style={{ zIndex: -1 }}
            />

            <div className="flex items-start justify-between mb-3">
              <div
                className={cn(
                  'p-2.5 rounded-xl',
                  card.color === 'primary' && 'bg-primary-500/10',
                  card.color === 'success' && 'bg-success-500/10',
                  card.color === 'warning' && 'bg-warning-500/10',
                  card.color === 'accent' && 'bg-accent-500/10',
                  card.color === 'critical' && 'bg-critical-500/10'
                )}
              >
                <Icon
                  className={cn(
                    'w-5 h-5',
                    card.color === 'primary' && 'text-primary-400',
                    card.color === 'success' && 'text-success-500',
                    card.color === 'warning' && 'text-warning-500',
                    card.color === 'accent' && 'text-accent-400',
                    card.color === 'critical' && 'text-critical-500'
                  )}
                />
              </div>
            </div>

            <p className="text-sm text-gray-400 mb-1">{card.title}</p>
            <p className="text-2xl font-bold text-white font-display">{card.value}</p>

            <div className="flex items-center gap-1.5 mt-3">
              <div
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-medium',
                  isPositive ? 'bg-success-500/20 text-success-500' : 'bg-critical-500/20 text-critical-500'
                )}
              >
                <TrendIcon className="w-3 h-3" />
                {Math.abs(card.change)}
                {card.title.includes('%') || card.title.includes('Rate') ? 'pp' : ''}
              </div>
              <span className="text-xs text-gray-500">{card.changeLabel}</span>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
