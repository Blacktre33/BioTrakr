'use client';

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartContainer, CustomTooltip } from '@/components/dashboard';
import { cn } from '@/lib/utils';
import type { UtilizationTrend } from '@/lib/api/utilization';

interface UtilizationTrendChartProps {
  data: UtilizationTrend[];
  isLoading?: boolean;
}

export function UtilizationTrendChart({ data, isLoading }: UtilizationTrendChartProps) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  if (isLoading) {
    return (
      <ChartContainer title="Utilization Trends" subtitle="Average asset utilization over time">
        <div className="h-72 flex items-center justify-center">
          <p className="text-gray-400">Loading...</p>
        </div>
      </ChartContainer>
    );
  }

  const filteredData = (() => {
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    return data.slice(-days);
  })();

  return (
    <ChartContainer
      title="Utilization Trends"
      subtitle="Average asset utilization over time"
      actions={
        <div className="flex gap-1 bg-surface-200/50 rounded-lg p-1">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                timeRange === range
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              {range}
            </button>
          ))}
        </div>
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="utilizationGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3374ff" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3374ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="utilization"
              name="Utilization"
              stroke="#3374ff"
              strokeWidth={2}
              fill="url(#utilizationGradient)"
              unit="%"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

