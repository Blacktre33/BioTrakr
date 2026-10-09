"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Card, Skeleton } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { PmDevice } from "@/lib/api/pm";
import { useOpenPmWorkOrder, usePmSchedule } from "@/lib/hooks/use-pm";
import { cn, formatDate } from "@/lib/utils";

const humanize = (v: string) => v.toLowerCase().replace(/_/g, " ");
const dayKey = (d: Date | string) => format(typeof d === "string" ? new Date(d) : d, "yyyy-MM-dd");

/** Monday-to-Sunday weeks covering the month (at most six). */
export function monthGrid(month: Date): { from: Date; to: Date; days: Date[] } {
  const from = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const last = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = from; d <= last; d = addDays(d, 1)) days.push(d);
  return { from, to: addDays(startOfDay(last), 1), days };
}

type ChipState = "overdue" | "open" | "due" | "done";

const CHIP: Record<ChipState, { className: string; label: string }> = {
  overdue: { className: "bg-critical-500/20 text-critical-500 border-critical-500/40", label: "overdue" },
  open: { className: "bg-primary-500/20 text-primary-400 border-primary-500/40", label: "work order open" },
  due: { className: "bg-surface-300/50 text-gray-200 border-white/10", label: "due, no work order yet" },
  done: { className: "bg-success-500/20 text-success-500 border-success-500/40", label: "done" },
};

function Chip({ assetId, tag, name, state }: { assetId: string; tag: string; name: string; state: ChipState }) {
  return (
    <li>
      <Link
        href={`/assets/${assetId}` as Route}
        title={`${name} (${tag}): ${CHIP[state].label}`}
        className={cn("block truncate rounded-md border px-1.5 py-0.5 text-xs hover:brightness-125", CHIP[state].className)}
      >
        {tag}
        <span className="sr-only">
          {" "}
          {name}, {CHIP[state].label}
        </span>
      </Link>
    </li>
  );
}

function OpenButton({ device }: { device: PmDevice }) {
  const mutation = useOpenPmWorkOrder();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={mutation.isPending}
      onClick={async () => {
        try {
          await mutation.mutateAsync(device.id);
          toast.success(`PM work order opened for ${device.equipmentName}`);
        } catch (err) {
          // Someone else opened one meanwhile: the list refreshes to show it.
          toast[err instanceof ApiError && err.statusCode === 409 ? "info" : "error"](
            (err as Error).message || "Could not open a work order. Please try again.",
          );
        }
      }}
    >
      {mutation.isPending ? "Opening…" : "Open work order"}
    </Button>
  );
}

function WorkOrderState({ device }: { device: PmDevice }) {
  if (!device.workOrder) return <OpenButton device={device} />;
  return (
    <div className="text-right text-xs text-gray-400">
      <Link href={"/maintenance" as Route} className="text-primary-400 hover:underline">
        Work order {humanize(device.workOrder.status)}
      </Link>
      <p>{device.workOrder.assignedTo ? `Assigned to ${device.workOrder.assignedTo}` : "Not assigned"}</p>
    </div>
  );
}

function OverdueList({ items, total }: { items: PmDevice[]; total: number }) {
  const now = Date.now();
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-white">
        Overdue <span className="text-gray-400">({total})</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">No preventive maintenance is overdue.</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/5">
          {items.map((d) => {
            const days = Math.floor((now - new Date(d.dueDate).getTime()) / 86_400_000);
            return (
              <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <Link href={`/assets/${d.id}` as Route} className="font-medium text-white hover:underline">
                    {d.equipmentName}
                  </Link>{" "}
                  <span className="font-mono text-xs text-gray-400">{d.assetTagNumber}</span>
                  {(d.criticalityLevel === "CRITICAL" || d.criticalityLevel === "HIGH") && (
                    <span className="ml-2">
                      <Badge size="sm" variant={d.criticalityLevel === "CRITICAL" ? "critical" : "warning"}>
                        {d.criticalityLevel === "CRITICAL" ? "Critical" : "High"} risk
                      </Badge>
                    </span>
                  )}
                  <p className="text-xs text-gray-400">
                    Due {formatDate(d.dueDate, "MMM d, yyyy")} ·{" "}
                    <span className="text-critical-500">{days <= 0 ? "due today" : `${days} day${days === 1 ? "" : "s"} overdue`}</span>
                    {d.location ? ` · ${d.location}` : ""}
                  </p>
                </div>
                <WorkOrderState device={d} />
              </li>
            );
          })}
        </ul>
      )}
      {total > items.length && (
        <p className="mt-2 text-xs text-gray-500">Showing the {items.length} most overdue of {total}.</p>
      )}
    </Card>
  );
}

/** Biomed's PM calendar: what falls due each day, what was done, and what is overdue. */
export function PmScheduleView({ facilityId }: { facilityId?: string }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const grid = useMemo(() => monthGrid(month), [month]);
  const schedule = usePmSchedule(grid.from, grid.to, facilityId);
  const today = new Date();

  const byDay = useMemo(() => {
    const map = new Map<string, Array<{ key: string; assetId: string; tag: string; name: string; state: ChipState }>>();
    const add = (day: string, chip: { key: string; assetId: string; tag: string; name: string; state: ChipState }) =>
      map.set(day, [...(map.get(day) ?? []), chip]);
    const now = Date.now();
    for (const d of schedule.data?.due ?? []) {
      add(dayKey(d.dueDate), {
        key: `due-${d.id}`,
        assetId: d.id,
        tag: d.assetTagNumber,
        name: d.equipmentName,
        state: new Date(d.dueDate).getTime() < now ? "overdue" : d.workOrder ? "open" : "due",
      });
    }
    for (const w of schedule.data?.done ?? []) {
      add(dayKey(w.completedAt), {
        key: `done-${w.id}`,
        assetId: w.asset.id,
        tag: w.asset.assetTagNumber,
        name: w.asset.equipmentName,
        state: "done",
      });
    }
    return map;
  }, [schedule.data]);

  const data = schedule.data;
  const dueThisMonth = data?.due.filter((d) => isSameMonth(new Date(d.dueDate), month)).length ?? 0;
  const doneThisMonth = data?.done.filter((w) => isSameMonth(new Date(w.completedAt), month)).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {schedule.isError && !data && (
        <p role="alert" className="text-critical-500">
          Couldn&apos;t load the PM schedule: {(schedule.error as Error).message}
        </p>
      )}
      {!data && schedule.isPending && <Skeleton className="h-96 w-full" />}
      {data && (
        <>
          <OverdueList items={data.overdue.items} total={data.overdue.total} />

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white" aria-live="polite">
                  {format(month, "MMMM yyyy")}
                </h2>
                <p className="text-sm text-gray-400">
                  {dueThisMonth} due · {doneThisMonth} done. Work orders open automatically {data.leadDays} days before
                  PM is due.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setMonth(startOfMonth(new Date()))}>
                  This month
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <ul className="mt-4 flex flex-wrap gap-3 text-xs text-gray-400" aria-label="Key">
              {(Object.keys(CHIP) as ChipState[]).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className={cn("inline-block h-3 w-3 rounded border", CHIP[s].className)} aria-hidden="true" />
                  {CHIP[s].label.charAt(0).toUpperCase() + CHIP[s].label.slice(1)}
                </li>
              ))}
            </ul>

            <div className="mt-4 grid grid-cols-7 gap-px text-center text-xs text-gray-500" aria-hidden="true">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <ol className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-white/5 bg-white/5">
              {grid.days.map((day) => {
                const chips = byDay.get(dayKey(day)) ?? [];
                const inMonth = isSameMonth(day, month);
                return (
                  <li
                    key={day.toISOString()}
                    aria-label={`${format(day, "EEEE d MMMM")}${chips.length ? `, ${chips.length} item${chips.length === 1 ? "" : "s"}` : ""}`}
                    className={cn("min-h-24 bg-surface-100 p-1.5", !inMonth && "bg-surface-50 opacity-60")}
                  >
                    <div
                      className={cn(
                        "mb-1 text-right text-xs",
                        isSameDay(day, today) ? "font-bold text-primary-400" : "text-gray-400",
                      )}
                      aria-hidden="true"
                    >
                      {format(day, "d")}
                    </div>
                    {chips.length > 0 && (
                      <ul className="space-y-1 text-left">
                        {chips.map((c) => (
                          <Chip key={c.key} assetId={c.assetId} tag={c.tag} name={c.name} state={c.state} />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
            {data.truncated && (
              <p className="mt-2 text-xs text-warning-500">
                Some items are not shown: narrow to one facility to see them all.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
