'use client';

import { Clock, TrendingUp, Activity, Calendar } from 'lucide-react';
import { Card } from '@/components/ui';
import type { UtilizationSummary } from '@/lib/api/utilization';

interface UtilizationSummaryCardsProps {
  summary: UtilizationSummary;
  isLoading?: boolean;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function UtilizationSummaryCards({ summary, isLoading }: UtilizationSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-24 mb-2" />
            <div className="h-8 bg-gray-700 rounded w-16" />
          </Card>
        ))}
      </div>
    );
  }

  const peakDayName = DAYS_OF_WEEK[summary.peakUtilizationDay] || 'Unknown';
  const peakHour = summary.peakUtilizationHour;
  const peakTime = `${peakHour}:00`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card variant="metric" accentColor="primary" className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">Average Utilization</p>
            <p className="text-2xl font-bold text-white mt-1">
              {summary.averageUtilization.toFixed(1)}%
            </p>
          </div>
          <TrendingUp className="w-8 h-8 text-primary-400" />
        </div>
      </Card>

      <Card variant="metric" accentColor="success" className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">Total Usage Hours</p>
            <p className="text-2xl font-bold text-white mt-1">
              {summary.totalUsageHours.toFixed(0)}
            </p>
          </div>
          <Clock className="w-8 h-8 text-success-400" />
        </div>
      </Card>

      <Card variant="metric" accentColor="warning" className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">Active Assets</p>
            <p className="text-2xl font-bold text-white mt-1">
              {summary.activeAssetsCount} / {summary.totalAssetsCount}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {summary.totalAssetsCount > 0
                ? ((summary.activeAssetsCount / summary.totalAssetsCount) * 100).toFixed(0)
                : 0}% active
            </p>
          </div>
          <Activity className="w-8 h-8 text-warning-400" />
        </div>
      </Card>

      <Card variant="metric" accentColor="info" className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">Peak Usage</p>
            <p className="text-lg font-bold text-white mt-1">{peakDayName}</p>
            <p className="text-sm text-gray-400 mt-0.5">{peakTime}</p>
          </div>
          <Calendar className="w-8 h-8 text-info-400" />
        </div>
      </Card>
    </div>
  );
}

