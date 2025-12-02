'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartContainer, CustomTooltip } from '@/components/dashboard';
import type { DepartmentUtilization } from '@/lib/api/utilization';

interface DepartmentUtilizationChartProps {
  data: DepartmentUtilization[];
  isLoading?: boolean;
}

export function DepartmentUtilizationChart({ data, isLoading }: DepartmentUtilizationChartProps) {
  if (isLoading) {
    return (
      <ChartContainer title="Utilization by Department" subtitle="Average utilization by department">
        <div className="h-72 flex items-center justify-center">
          <p className="text-gray-400">Loading...</p>
        </div>
      </ChartContainer>
    );
  }

  const chartData = data.slice(0, 10).map((item) => ({
    department: item.departmentName,
    utilization: item.averageUtilization,
    assets: item.assetCount,
    sessions: item.sessionCount,
  }));

  return (
    <ChartContainer
      title="Utilization by Department"
      subtitle="Top departments by utilization"
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }} barGap={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="department"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="utilization"
              name="Utilization"
              fill="#25a99f"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
              unit="%"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

