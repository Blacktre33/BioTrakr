"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertOctagon, CalendarClock, CheckCircle2, Clock, ShieldCheck, Wrench, type LucideIcon } from "lucide-react";

import { Header } from "@/components/layout";
import { FacilityPicker } from "@/components/layout/facility-picker";
import { Badge, Card, Skeleton } from "@/components/ui";
import type { DashboardSummary, DeviceStatus } from "@/lib/api/dashboard";
import { useDashboard } from "@/lib/hooks/use-dashboard";
import { cn, formatDate, formatNumber, formatRelativeTime } from "@/lib/utils";

import { ChartContainer, CustomTooltip } from "./charts";

const humanize = (v: string) =>
  v
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** "45 min", "7.5 h", "3.2 days". */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

type Tone = "neutral" | "good" | "warning" | "critical";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-white",
  good: "text-success-500",
  warning: "text-warning-500",
  critical: "text-critical-500",
};

function Tile({
  title,
  value,
  detail,
  href,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  value: string;
  detail: string;
  href?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Icon className={cn("h-4 w-4", tone === "neutral" ? "text-gray-400" : TONE_TEXT[tone])} aria-hidden="true" />
        {title}
      </div>
      <p className={cn("mt-2 font-display text-3xl font-bold", TONE_TEXT[tone])}>{value}</p>
      <p className="mt-1 text-xs text-gray-400">{detail}</p>
    </>
  );
  const box = "block h-full rounded-2xl border border-white/5 bg-surface-100/50 p-5";
  return (
    <li>
      {href ? (
        <Link href={href as Route} className={cn(box, "transition-colors hover:border-white/15")}>
          {body}
        </Link>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}

function Tiles({ data }: { data: DashboardSummary }) {
  const { devices, pm, workOrders, repairs } = data;
  const compliance = pm.compliancePercent;
  return (
    <ul aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <Tile
        title="In use"
        value={formatNumber(devices.inUse)}
        detail={`of ${plural(devices.total, "device")} in inventory`}
        href="/assets?status=ACTIVE,IN_SERVICE"
        icon={CheckCircle2}
      />
      <Tile
        title="Out of use"
        value={formatNumber(devices.outOfUse)}
        detail="Quarantined or being repaired"
        href="/assets?status=QUARANTINED,IN_MAINTENANCE"
        icon={AlertOctagon}
        tone={devices.outOfUse > 0 ? "critical" : "good"}
      />
      <Tile
        title="PM overdue"
        value={formatNumber(pm.overdue)}
        detail={`${formatNumber(pm.dueSoon)} more due in the next ${pm.dueSoonDays} days`}
        href="/maintenance/schedule"
        icon={CalendarClock}
        tone={pm.overdue > 0 ? "warning" : "good"}
      />
      <Tile
        title="PM compliance"
        value={compliance === null ? "–" : `${compliance}%`}
        detail={
          pm.notScheduled > 0
            ? `${plural(pm.notScheduled, "device")} without a PM schedule`
            : "Scheduled devices not overdue"
        }
        href="/maintenance/schedule"
        icon={ShieldCheck}
        tone={compliance === null ? "neutral" : compliance >= 95 ? "good" : compliance >= 80 ? "warning" : "critical"}
      />
      <Tile
        title="Open work orders"
        value={formatNumber(workOrders.open)}
        detail={[
          `${formatNumber(workOrders.urgent)} urgent`,
          `${formatNumber(workOrders.unassigned)} not assigned`,
          workOrders.awaitingParts > 0 ? `${formatNumber(workOrders.awaitingParts)} waiting for parts` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        href="/maintenance"
        icon={Wrench}
        tone={workOrders.urgent > 0 ? "critical" : "neutral"}
      />
      <Tile
        title="Time to repair"
        value={repairs.meanHours === null ? "–" : formatHours(repairs.meanHours)}
        detail={
          repairs.completed === 0
            ? `No repairs finished in ${repairs.windowDays} days`
            : `Average of ${plural(repairs.completed, "repair")}, last ${repairs.windowDays} days (median ${formatHours(repairs.medianHours!)})`
        }
        icon={Clock}
      />
    </ul>
  );
}

function WorkTrend({ weekly }: { weekly: DashboardSummary["workOrders"]["weekly"] }) {
  const data = weekly.map((w) => ({ ...w, label: formatDate(w.weekStart, "MMM d") }));
  const opened = weekly.reduce((s, w) => s + w.opened, 0);
  const completed = weekly.reduce((s, w) => s + w.completed, 0);
  return (
    <ChartContainer
      title="Work orders per week"
      subtitle={`Last ${weekly.length} weeks: ${formatNumber(opened)} opened, ${formatNumber(completed)} completed`}
    >
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="opened" name="Opened" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* The same numbers for screen readers. */}
      <table className="sr-only">
        <caption>Work orders opened and completed per week</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Opened</th>
            <th scope="col">Completed</th>
          </tr>
        </thead>
        <tbody>
          {data.map((w) => (
            <tr key={w.weekStart}>
              <th scope="row">{w.label}</th>
              <td>{w.opened}</td>
              <td>{w.completed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartContainer>
  );
}

const STATUS_ORDER: Array<{ status: DeviceStatus; bar: string }> = [
  { status: "ACTIVE", bar: "bg-success-500" },
  { status: "IN_SERVICE", bar: "bg-primary-500" },
  { status: "IN_MAINTENANCE", bar: "bg-warning-500" },
  { status: "QUARANTINED", bar: "bg-critical-500" },
  { status: "CONDEMNED", bar: "bg-gray-500" },
  { status: "RETIRED", bar: "bg-gray-600" },
  { status: "DISPOSED", bar: "bg-gray-700" },
];

function StatusBreakdown({ byStatus }: { byStatus: DashboardSummary["devices"]["byStatus"] }) {
  const max = Math.max(1, ...Object.values(byStatus));
  return (
    <ChartContainer title="Devices by status" subtitle="Every device on record, including retired ones">
      <ul className="space-y-3">
        {STATUS_ORDER.map(({ status, bar }) => (
          <li key={status}>
            <Link
              href={`/assets?status=${status}` as Route}
              className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm hover:text-white"
            >
              <span className="text-gray-300">{humanize(status)}</span>
              <span className="h-2 rounded-full bg-surface-200/60" aria-hidden="true">
                <span
                  className={cn("block h-2 rounded-full", bar)}
                  style={{ width: `${(byStatus[status] / max) * 100}%` }}
                />
              </span>
              <span className="text-right font-medium text-white">{formatNumber(byStatus[status])}</span>
            </Link>
          </li>
        ))}
      </ul>
    </ChartContainer>
  );
}

const RISK_VARIANT: Record<string, "critical" | "warning" | "neutral"> = {
  CRITICAL: "critical",
  HIGH: "warning",
};

function DeviceList({
  title,
  empty,
  more,
  children,
}: {
  title: string;
  empty: string;
  more?: { href: string; label: string };
  children: React.ReactNode[];
}) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {more && (
          <Link href={more.href as Route} className="text-sm text-primary-400 hover:underline">
            {more.label}
          </Link>
        )}
      </div>
      {children.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-white/5">{children}</ul>
      )}
    </Card>
  );
}

function DeviceRow({
  id,
  name,
  tag,
  risk,
  location,
  right,
}: {
  id: string;
  name: string;
  tag: string;
  risk: string;
  location: string;
  right: React.ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <Link href={`/assets/${id}` as Route} className="font-medium text-white hover:underline">
          {name}
        </Link>{" "}
        <span className="font-mono text-xs text-gray-400">{tag}</span>
        {RISK_VARIANT[risk] && (
          <span className="ml-2">
            <Badge size="sm" variant={RISK_VARIANT[risk]}>
              {humanize(risk)} risk
            </Badge>
          </span>
        )}
        <p className="truncate text-xs text-gray-400">{location || "Location not recorded"}</p>
      </div>
      <div className="shrink-0 text-right text-sm">{right}</div>
    </li>
  );
}

function Lists({ data }: { data: DashboardSummary }) {
  const { devices, pm } = data;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <DeviceList
        title="Out of use now"
        empty="Every device is in use."
        more={
          devices.outOfUse > devices.outOfUseList.length
            ? { href: "/assets?status=QUARANTINED,IN_MAINTENANCE", label: `All ${devices.outOfUse}` }
            : undefined
        }
      >
        {devices.outOfUseList.map((d) => (
          <DeviceRow
            key={d.id}
            id={d.id}
            name={d.equipmentName}
            tag={d.assetTagNumber}
            risk={d.criticalityLevel}
            location={d.location}
            right={
              <>
                <p className={d.assetStatus === "QUARANTINED" ? "text-critical-500" : "text-warning-500"}>
                  {humanize(d.assetStatus)}
                </p>
                {d.since && <p className="text-xs text-gray-500">{formatRelativeTime(d.since)}</p>}
              </>
            }
          />
        ))}
      </DeviceList>
      <DeviceList
        title="PM overdue"
        empty="No preventive maintenance is overdue."
        more={{ href: "/maintenance/schedule", label: "PM schedule" }}
      >
        {pm.overdueList.map((d) => (
          <DeviceRow
            key={d.id}
            id={d.id}
            name={d.equipmentName}
            tag={d.assetTagNumber}
            risk={d.criticalityLevel}
            location={d.location}
            right={
              <>
                <p className="text-warning-500">
                  {d.daysOverdue === 0 ? "Due today" : `${plural(d.daysOverdue, "day")} overdue`}
                </p>
                <p className="text-xs text-gray-500">
                  {d.openWorkOrder ? `Work order ${humanize(d.openWorkOrder.workOrderStatus).toLowerCase()}` : "No work order"}
                </p>
              </>
            }
          />
        ))}
      </DeviceList>
    </div>
  );
}

/** Live overview for biomed and managers, counted from the database. */
export function DashboardOverview() {
  const [facilityId, setFacilityId] = useState("");
  const dashboard = useDashboard(facilityId || undefined);
  const data = dashboard.data;

  return (
    <>
      <Header
        title="Dashboard"
        subtitle={data ? `Updated ${formatRelativeTime(data.generatedAt)}` : "Devices, maintenance and repairs"}
        actions={<FacilityPicker value={facilityId} onChange={setFacilityId} />}
      />
      <div className="space-y-6 p-6">
        {dashboard.isError && !data && (
          <p role="alert" className="rounded-2xl border border-critical-500/40 p-4 text-critical-500">
            Couldn&apos;t load the dashboard: {(dashboard.error as Error).message}
          </p>
        )}
        {!data && dashboard.isPending && (
          <div aria-label="Loading dashboard" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}
        {data && (
          <>
            <Tiles data={data} />
            <Lists data={data} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <WorkTrend weekly={data.workOrders.weekly} />
              <StatusBreakdown byStatus={data.devices.byStatus} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
