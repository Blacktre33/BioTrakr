'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout';
import {
  UtilizationSummaryCards,
  UtilizationTrendChart,
  CategoryUtilizationChart,
  DepartmentUtilizationChart,
  PeakUsageChart,
  IdleAssetsWidget,
  AssetUtilizationTable,
  UtilizationFilters,
  type TimeRange,
} from '@/components/utilization';
import {
  useUtilizationSummary,
  useAssetUtilization,
  useCategoryUtilization,
  useDepartmentUtilization,
  useUtilizationTrends,
  useIdleAssets,
} from '@/lib/hooks/use-utilization';

export default function UtilizationPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [startDate, setStartDate] = useState<string>();
  const [endDate, setEndDate] = useState<string>();

  // Calculate date range based on time range selection
  const dateRange = useMemo(() => {
    const end = endDate ? new Date(endDate) : new Date();
    let start: Date;

    if (startDate) {
      start = new Date(startDate);
    } else {
      start = new Date();
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      start.setDate(end.getDate() - days);
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, [timeRange, startDate, endDate]);

  // Fetch all utilization data
  const { data: summary, isLoading: summaryLoading } = useUtilizationSummary(dateRange);
  const { data: assetUtilization, isLoading: assetsLoading } = useAssetUtilization(dateRange);
  const { data: categoryUtilization, isLoading: categoryLoading } = useCategoryUtilization(dateRange);
  const { data: departmentUtilization, isLoading: departmentLoading } = useDepartmentUtilization(dateRange);
  const { data: trends, isLoading: trendsLoading } = useUtilizationTrends({
    ...dateRange,
    granularity: timeRange === '7d' ? 'day' : timeRange === '30d' ? 'day' : 'week',
  });
  const { data: idleAssets, isLoading: idleLoading } = useIdleAssets({
    ...dateRange,
    maxUtilization: 30,
    minDaysIdle: 7,
  });

  // Calculate peak usage hours from trends
  const peakUsageData = useMemo(() => {
    if (!trends || trends.length === 0) return [];

    // Group by hour (simplified - in production, you'd aggregate by hour from UsageLog)
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i}:00`,
      utilization: Math.random() * 100, // Placeholder - would need hour-level aggregation
    }));

    return hours;
  }, [trends]);

  return (
    <>
      <Header title="Asset Utilization" subtitle="Track and analyze asset usage patterns" />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <UtilizationFilters
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />

        {/* Summary Cards */}
        {summary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <UtilizationSummaryCards summary={summary} isLoading={summaryLoading} />
          </motion.div>
        )}

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {trends && (
              <UtilizationTrendChart data={trends} isLoading={trendsLoading} />
            )}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {categoryUtilization && (
              <CategoryUtilizationChart data={categoryUtilization} isLoading={categoryLoading} />
            )}
          </motion.div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {departmentUtilization && (
              <DepartmentUtilizationChart data={departmentUtilization} isLoading={departmentLoading} />
            )}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            {peakUsageData.length > 0 && (
              <PeakUsageChart data={peakUsageData} isLoading={false} />
            )}
          </motion.div>
        </div>

        {/* Table and Idle Assets */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {assetUtilization && (
              <AssetUtilizationTable data={assetUtilization} isLoading={assetsLoading} />
            )}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            {idleAssets && (
              <IdleAssetsWidget assets={idleAssets} isLoading={idleLoading} />
            )}
          </motion.div>
        </div>
      </div>
    </>
  );
}

