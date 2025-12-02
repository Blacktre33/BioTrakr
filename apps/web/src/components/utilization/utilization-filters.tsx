'use client';

import { Calendar, Filter } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

export type TimeRange = '7d' | '30d' | '90d' | 'custom';

interface UtilizationFiltersProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  startDate?: string;
  endDate?: string;
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;
  showCustomDateRange?: boolean;
}

export function UtilizationFilters({
  timeRange,
  onTimeRangeChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  showCustomDateRange = true,
}: UtilizationFiltersProps) {
  const handleQuickRange = (range: '7d' | '30d' | '90d') => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (range === '7d' ? 7 : range === '30d' ? 30 : 90));
    
    onStartDateChange?.(start.toISOString().split('T')[0]);
    onEndDateChange?.(end.toISOString().split('T')[0]);
    onTimeRangeChange(range);
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-surface-200/30 rounded-lg border border-white/5">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-300">Time Range:</span>
      </div>
      
      <div className="flex gap-2">
        <Button
          variant={timeRange === '7d' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => handleQuickRange('7d')}
        >
          7 Days
        </Button>
        <Button
          variant={timeRange === '30d' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => handleQuickRange('30d')}
        >
          30 Days
        </Button>
        <Button
          variant={timeRange === '90d' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => handleQuickRange('90d')}
        >
          90 Days
        </Button>
        {showCustomDateRange && (
          <Button
            variant={timeRange === 'custom' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onTimeRangeChange('custom')}
            leftIcon={<Calendar className="w-4 h-4" />}
          >
            Custom
          </Button>
        )}
      </div>

      {timeRange === 'custom' && showCustomDateRange && (
        <div className="flex items-center gap-2 ml-auto">
          <Input
            type="date"
            value={startDate || ''}
            onChange={(e) => onStartDateChange?.(e.target.value)}
            className="w-40"
          />
          <span className="text-gray-400">to</span>
          <Input
            type="date"
            value={endDate || ''}
            onChange={(e) => onEndDateChange?.(e.target.value)}
            className="w-40"
          />
        </div>
      )}
    </div>
  );
}

