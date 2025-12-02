'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ChartContainer, CustomTooltip } from '@/components/dashboard';

interface PeakUsageData {
  hour: number;
  utilization: number;
  label: string;
}

interface PeakUsageChartProps {
  data: PeakUsageData[];
  isLoading?: boolean;
}

export function PeakUsageChart({ data, isLoading }: PeakUsageChartProps) {
  if (isLoading) {
    return (
      <ChartContainer title="Peak Usage Hours" subtitle="Utilization by hour of day">
        <div className="h-64 flex items-center justify-center">
          <p className="text-gray-400">Loading...</p>
        </div>
      </ChartContainer>
    );
  }

  const getColor = (value: number) => {
    if (value >= 80) return '#ef4444'; // red
    if (value >= 60) return '#f59e0b'; // orange
    if (value >= 40) return '#eab308'; // yellow
    if (value >= 20) return '#25a99f'; // teal
    return '#3374ff'; // blue
  };

  return (
    <ChartContainer
      title="Peak Usage Hours"
      subtitle="Utilization by hour of day"
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6b7280', fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="utilization" name="Utilization" radius={[4, 4, 0, 0]} maxBarSize={24} unit="%">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(entry.utilization)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

