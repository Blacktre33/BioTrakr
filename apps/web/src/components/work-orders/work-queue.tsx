"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { AlertOctagon, Siren } from "lucide-react";
import { toast } from "sonner";

import { ERROR_BORDER, Field, SELECT_CLASS, describedBy } from "@/components/forms/form-field";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Textarea,
} from "@/components/ui";
import type { WorkOrder, WorkOrderStatus, WorkOrderUpdate, WorkOrderView } from "@/lib/api/work-orders";
import { getSession } from "@/lib/auth/session";
import { useTechnicians, useUpdateWorkOrderMutation, useWorkOrders } from "@/lib/hooks/use-work-orders";
import { cn, formatDate, formatRelativeTime } from "@/lib/utils";

const PAGE_SIZE = 25;
const OUT_OF_USE = ["QUARANTINED", "IN_MAINTENANCE", "CONDEMNED", "RETIRED", "DISPOSED"];
const RELEASABLE = ["QUARANTINED", "IN_MAINTENANCE"];
const FAILURE_CATEGORIES = [
  "ELECTRICAL",
  "MECHANICAL",
  "SOFTWARE",
  "HYDRAULIC",
  "PNEUMATIC",
  "SENSOR",
  "CALIBRATION",
  "USER_ERROR",
  "UNKNOWN",
];

const humanize = (v: string) =>
  v
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const STATUS_VARIANT: Record<WorkOrderStatus, "neutral" | "primary" | "accent" | "warning" | "success" | "critical"> = {
  PENDING: "warning",
  ASSIGNED: "primary",
  IN_PROGRESS: "accent",
  AWAITING_PARTS: "neutral",
  ON_HOLD: "neutral",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

const VIEWS: Array<{ id: WorkOrderView; label: string }> = [
  { id: "open", label: "Open" },
  { id: "mine", label: "Assigned to me" },
  { id: "done", label: "Done" },
];

/** Complete or cancel: both need a note; completing can release the device. */
function CloseDialog({
  order,
  mode,
  onClose,
}: {
  order: WorkOrder;
  mode: "complete" | "cancel";
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [failureCategory, setFailureCategory] = useState("");
  const [release, setRelease] = useState(false);
  const [confirmSafe, setConfirmSafe] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const mutation = useUpdateWorkOrderMutation();
  const canRelease = mode === "complete" && RELEASABLE.includes(order.asset.assetStatus);

  const noteError = submitted && note.trim().length < 5 ? (mode === "complete" ? "Say what was done" : "Say why") : undefined;
  const safeError = submitted && release && !confirmSafe ? "Confirm the device is safe before releasing it" : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (note.trim().length < 5 || (release && !confirmSafe)) return;
    try {
      const result = await mutation.mutateAsync({
        id: order.id,
        body: {
          expectedStatus: order.workOrderStatus,
          status: mode === "complete" ? "COMPLETED" : "CANCELLED",
          workPerformed: note.trim(),
          ...(failureCategory ? { failureCategory } : {}),
          ...(release ? { releaseDevice: true, confirmSafe: true } : {}),
        },
      });
      toast.success(
        mode === "cancel"
          ? "Work order cancelled"
          : result.deviceReleased
            ? `Completed. ${order.asset.equipmentName} is back in use.`
            : "Work order completed",
      );
      onClose();
    } catch (err) {
      setServerError((err as Error).message || "Could not save. Please try again.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "complete" ? "Complete work order" : "Cancel work order"}</DialogTitle>
          <DialogDescription>
            {order.asset.equipmentName} ({order.asset.assetTagNumber})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field field="wo-note" label={mode === "complete" ? "What was done" : "Why cancel"} required error={noteError}>
            <Textarea
              {...describedBy("wo-note", noteError)}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={4000}
              autoFocus
              className={cn(noteError && ERROR_BORDER)}
            />
          </Field>
          {mode === "complete" && (
            <Field field="wo-failure" label="Cause (optional)">
              <select
                {...describedBy("wo-failure")}
                value={failureCategory}
                onChange={(e) => setFailureCategory(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Not recorded</option>
                {FAILURE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {canRelease && (
            <div className="space-y-2 rounded-xl border border-white/10 p-3 text-sm text-gray-100">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={release} onChange={(e) => setRelease(e.target.checked)} className="mt-1" />
                <span>
                  Put the device back into use (it is now {humanize(order.asset.assetStatus).toLowerCase()})
                </span>
              </label>
              {release && (
                <label className="flex items-start gap-3 rounded-lg bg-warning-500/10 p-2">
                  <input
                    type="checkbox"
                    checked={confirmSafe}
                    onChange={(e) => setConfirmSafe(e.target.checked)}
                    className="mt-1"
                    aria-describedby={safeError ? "wo-safe-error" : undefined}
                  />
                  <span>
                    I confirm it has been checked and is safe to use on patients. Ward staff will see it as{" "}
                    <strong>OK to use</strong>.
                  </span>
                </label>
              )}
              {safeError && (
                <p id="wo-safe-error" role="alert" className="text-critical-500">
                  {safeError}
                </p>
              )}
            </div>
          )}
          {serverError && (
            <p role="alert" className="text-sm text-critical-500">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
              Back
            </Button>
            <Button type="submit" variant={mode === "cancel" ? "danger" : "primary"} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : mode === "complete" ? "Complete" : "Cancel work order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WorkOrderCard({ order, technicians }: { order: WorkOrder; technicians: Array<{ id: string; name: string }> }) {
  const me = getSession()?.user.id;
  const mutation = useUpdateWorkOrderMutation();
  const [closing, setClosing] = useState<"complete" | "cancel" | null>(null);
  const open = !["COMPLETED", "CANCELLED"].includes(order.workOrderStatus);
  const deviceOut = OUT_OF_USE.includes(order.asset.assetStatus);

  const act = async (body: Omit<WorkOrderUpdate, "expectedStatus">, done: string) => {
    try {
      await mutation.mutateAsync({ id: order.id, body: { expectedStatus: order.workOrderStatus, ...body } });
      toast.success(done);
    } catch (err) {
      toast.error((err as Error).message || "Could not update. Please try again.");
    }
  };

  const s = order.workOrderStatus;
  return (
    <li
      className={cn(
        "rounded-2xl border bg-surface-100/50 p-4",
        order.isEmergency && open ? "border-critical-500/60" : "border-white/10",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {order.isEmergency && open && (
          <span className="inline-flex items-center gap-1 rounded-full bg-critical-500/15 px-2 py-0.5 text-xs font-semibold text-critical-500">
            <Siren className="h-3.5 w-3.5" aria-hidden="true" /> Urgent
          </span>
        )}
        <Badge variant={STATUS_VARIANT[s]} size="sm">
          {humanize(s)}
        </Badge>
        <span className="text-xs text-gray-400">{humanize(order.workOrderType)}</span>
        <span className="ml-auto text-xs text-gray-500" title={formatDate(order.scheduledDate, "MMM d, yyyy HH:mm")}>
          {formatRelativeTime(order.scheduledDate)}
        </span>
      </div>

      <h3 className="mt-2 font-medium text-white">
        <Link href={`/assets/${order.asset.id}` as Route} className="hover:underline">
          {order.asset.equipmentName}
        </Link>{" "}
        <span className="font-mono text-sm text-gray-400">{order.asset.assetTagNumber}</span>
      </h3>
      <p className="text-sm text-gray-400">
        {order.asset.location || "Location not recorded"}
        {deviceOut && (
          <span className="ml-2 inline-flex items-center gap-1 text-critical-500">
            <AlertOctagon className="h-3.5 w-3.5" aria-hidden="true" /> {humanize(order.asset.assetStatus)}
          </span>
        )}
      </p>
      {order.description && <p className="mt-2 whitespace-pre-line text-sm text-gray-200">{order.description}</p>}
      {order.workPerformed && (
        <p className="mt-2 rounded-lg bg-surface-200/40 p-2 text-sm text-gray-300">{order.workPerformed}</p>
      )}
      <p className="mt-2 text-xs text-gray-500">
        {order.reportedBy
          ? `Reported by ${order.reportedBy}`
          : order.workOrderType === "PREVENTIVE_MAINTENANCE"
            ? "Opened by the PM schedule"
            : "Reporter unknown"}
        {order.assignedTo ? ` · Assigned to ${order.assignedTo.name}` : " · Not assigned"}
        {order.completedAt ? ` · Closed ${formatDate(order.completedAt, "MMM d, HH:mm")}` : ""}
      </p>

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(s === "PENDING" || s === "ASSIGNED") && (
            <Button
              size="sm"
              onClick={() =>
                act(
                  { status: "IN_PROGRESS", ...(!order.assignedTo && me ? { assignedTechnicianId: me } : {}) },
                  "Started",
                )
              }
              disabled={mutation.isPending}
            >
              Start work
            </Button>
          )}
          {s === "IN_PROGRESS" && (
            <>
              <Button size="sm" variant="secondary" onClick={() => act({ status: "AWAITING_PARTS" }, "Marked as waiting for parts")}>
                Waiting for parts
              </Button>
              <Button size="sm" variant="secondary" onClick={() => act({ status: "ON_HOLD" }, "Put on hold")}>
                On hold
              </Button>
            </>
          )}
          {(s === "AWAITING_PARTS" || s === "ON_HOLD") && (
            <Button size="sm" onClick={() => act({ status: "IN_PROGRESS" }, "Resumed")}>
              Resume
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setClosing("complete")}>
            Complete…
          </Button>
          <label className="sr-only" htmlFor={`assign-${order.id}`}>
            Assign to
          </label>
          <select
            id={`assign-${order.id}`}
            className={cn(SELECT_CLASS, "w-auto py-1.5 text-sm")}
            value={order.assignedTo?.id ?? ""}
            onChange={(e) => e.target.value && act({ assignedTechnicianId: e.target.value }, "Assigned")}
            disabled={mutation.isPending}
          >
            <option value="" disabled>
              Assign to…
            </option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id === me ? `${t.name} (me)` : t.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" className="text-critical-500" onClick={() => setClosing("cancel")}>
            Cancel…
          </Button>
        </div>
      )}
      {closing && <CloseDialog order={order} mode={closing} onClose={() => setClosing(null)} />}
    </li>
  );
}

/** Biomed's queue: what ward staff reported and scheduled work, urgent first. */
export function WorkQueue() {
  const [view, setView] = useState<WorkOrderView>("open");
  const [page, setPage] = useState(0);
  const orders = useWorkOrders(view, page, PAGE_SIZE);
  const technicians = useTechnicians();
  const total = orders.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div role="tablist" aria-label="Work orders" className="flex gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => {
              setView(v.id);
              setPage(0);
            }}
            className={cn(
              "rounded-xl px-4 py-2 text-sm",
              view === v.id ? "bg-primary-500/20 text-white" : "text-gray-400 hover:text-gray-200",
            )}
          >
            {v.label}
            {view === v.id && orders.data ? ` (${total})` : ""}
          </button>
        ))}
      </div>

      {orders.isPending && (
        <div className="space-y-3" aria-label="Loading work orders">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}
      {orders.isError && (
        <p role="alert" className="text-critical-500">
          Couldn&apos;t load work orders: {(orders.error as Error).message}
        </p>
      )}
      {orders.data && orders.data.items.length === 0 && (
        <p className="rounded-2xl border border-white/10 p-6 text-center text-gray-400">
          {view === "done" ? "Nothing closed yet." : view === "mine" ? "Nothing assigned to you." : "No open work orders."}
        </p>
      )}
      {orders.data && orders.data.items.length > 0 && (
        <ul className="space-y-3">
          {orders.data.items.map((o) => (
            <WorkOrderCard key={o.id} order={o} technicians={technicians.data ?? []} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
            Previous
          </Button>
          <span className="text-sm text-gray-400">
            Page {page + 1} of {pages}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages}>
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
