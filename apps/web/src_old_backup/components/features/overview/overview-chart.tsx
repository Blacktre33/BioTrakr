"use client";

import { ResponsiveContainer, AreaChart, Area, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const utilizationData = [
  { month: "Jan", utilization: 62 },
  { month: "Feb", utilization: 65 },
  { month: "Mar", utilization: 68 },
  { month: "Apr", utilization: 71 },
  { month: "May", utilization: 73 },
  { month: "Jun", utilization: 76 },
];

export function OverviewChart() {
  return (
    <Card className="col-span-1 lg:col-span-2 xl:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">Asset Utilization</CardTitle>
        <span className="text-xs text-muted-foreground">Last 6 months</span>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={utilizationData} margin={{ top: 10, left: 10, right: 10 }}>
            <defs>
              <linearGradient id="utilization" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(value) => `${value}%`} />
            <Tooltip
              cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1 }}
              contentStyle={{ borderRadius: 12, borderColor: "hsl(var(--border))" }}
              formatter={(value: number) => [`${value}%`, "Utilization"]}
            />
            <Area type="monotone" dataKey="utilization" stroke="hsl(var(--chart-1))" fill="url(#utilization)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
