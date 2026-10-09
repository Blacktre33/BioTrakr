"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ERROR_BORDER, Field, SELECT_CLASS, describedBy } from "@/components/forms/form-field";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@/components/ui";
import type { FormOption } from "@/lib/api/reference";
import { useChangeAssetStatusMutation } from "@/lib/hooks/use-asset-status";
import { cn } from "@/lib/utils";

/** Must match the API's STOP_STATUSES (asset-status.service.ts). */
export const STOP_STATUSES = ["QUARANTINED", "IN_MAINTENANCE", "CONDEMNED", "RETIRED", "DISPOSED"];

interface ChangeStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  equipmentName: string;
  currentStatus: string;
  statusOptions: FormOption[];
}

/**
 * Changing status always needs a reason. Releasing a device back into use
 * also needs an explicit confirmation that it is safe, because that is what
 * turns the scan banner green for every nurse who scans it next.
 */
export function ChangeStatusDialog({
  open,
  onOpenChange,
  assetId,
  equipmentName,
  currentStatus,
  statusOptions,
}: ChangeStatusDialogProps) {
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [confirmedSafe, setConfirmedSafe] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const mutation = useChangeAssetStatusMutation(assetId);

  const label = (value: string) => statusOptions.find((o) => o.value === value)?.label ?? value;
  const releasing = STOP_STATUSES.includes(currentStatus) && status !== "" && !STOP_STATUSES.includes(status);

  const errors = {
    status: !status ? "Choose the new status" : undefined,
    reason: reason.trim().length < 5 ? "Say why (at least a few words)" : undefined,
    confirm: releasing && !confirmedSafe ? "Confirm the device is safe before releasing it" : undefined,
  };
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);

  const reset = () => {
    setStatus("");
    setReason("");
    setConfirmedSafe(false);
    setSubmitted(false);
    setServerError(undefined);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (errors.status || errors.reason || errors.confirm) return;
    try {
      await mutation.mutateAsync({ status, reason: reason.trim(), expectedStatus: currentStatus });
      toast.success(`${equipmentName} is now ${label(status)}`);
      close(false);
    } catch (error) {
      setServerError((error as Error).message || "Could not change the status. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change status</DialogTitle>
          <DialogDescription>
            {equipmentName} is currently <strong>{label(currentStatus)}</strong>. The change and your reason are kept in its
            history.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field field="new-status" label="New status" required error={show("status")}>
            <select
              {...describedBy("new-status", show("status"))}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={cn(SELECT_CLASS, show("status") && ERROR_BORDER)}
            >
              <option value="" disabled>
                Choose
              </option>
              {statusOptions
                .filter((o) => o.value !== currentStatus)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.hint ? `${o.label} — ${o.hint}` : o.label}
                  </option>
                ))}
            </select>
          </Field>

          <Field
            field="status-reason"
            label="Reason"
            required
            error={show("reason")}
            hint={releasing ? "e.g. what was repaired and which checks it passed" : undefined}
          >
            <Textarea
              {...describedBy(
                "status-reason",
                show("reason"),
                releasing ? "e.g. what was repaired and which checks it passed" : undefined,
              )}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              className={cn(show("reason") && ERROR_BORDER)}
            />
          </Field>

          {releasing && (
            <div className="space-y-1">
              <label className="flex items-start gap-3 rounded-xl border border-warning-500/40 bg-warning-500/10 p-3 text-sm text-gray-100">
                <input
                  type="checkbox"
                  checked={confirmedSafe}
                  onChange={(e) => setConfirmedSafe(e.target.checked)}
                  className="mt-1"
                  aria-describedby={show("confirm") ? "confirm-safe-error" : undefined}
                />
                <span>
                  I confirm this device has been checked and is safe to use on patients. Ward staff will see it as{" "}
                  <strong>OK to use</strong> when they scan it.
                </span>
              </label>
              {show("confirm") && (
                <p id="confirm-safe-error" role="alert" className="text-sm text-critical-500">
                  {show("confirm")}
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
            <Button type="button" variant="ghost" onClick={() => close(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : releasing ? "Release to service" : "Change status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
