import { ArrowUpRight, Clock, ShieldCheck } from "lucide-react";

import { OverviewChart } from "@/components/features/overview/overview-chart";
import { LocationMap } from "@/components/features/overview/location-map";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

const SUMMARY_METRICS = [
  {
    title: "Active Assets",
    value: formatNumber(1842),
    change: "+4.2% vs last quarter",
    icon: ArrowUpRight,
  },
  {
    title: "Maintenance Compliance",
    value: "96.4%",
    change: "On track",
    icon: ShieldCheck,
  },
  {
    title: "Upcoming PM Tasks",
    value: 37,
    change: "Within 7 days",
    icon: Clock,
  },
];

const UPCOMING_TASKS = [
  { assetTag: "IP-001", name: "Infusion Pump - Alaris", dueIn: "2 days", facility: "Main Campus", status: "Scheduled" },
  { assetTag: "PM-014", name: "Patient Monitor - Philips MX800", dueIn: "4 days", facility: "ICU", status: "Awaiting Parts" },
  { assetTag: "VENT-008", name: "Ventilator - Puritan Bennett 980", dueIn: "5 days", facility: "Respiratory", status: "Scheduled" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SUMMARY_METRICS.map(({ title, value, change, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{value}</div>
              <p className="text-xs text-muted-foreground">{change}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <OverviewChart />
        <LocationMap />
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Upcoming Maintenance</CardTitle>
            <CardDescription>Top priority tasks scheduled for the coming week.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {UPCOMING_TASKS.map((task) => (
                  <TableRow key={task.assetTag}>
                    <TableCell>
                      <div className="font-medium">{task.name}</div>
                      <div className="text-xs text-muted-foreground">{task.assetTag}</div>
                    </TableCell>
                    <TableCell>{task.facility}</TableCell>
                    <TableCell>{task.dueIn}</TableCell>
                    <TableCell className="flex justify-end">
                      <Badge variant={task.status === "Awaiting Parts" ? "destructive" : "secondary"}>{task.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
