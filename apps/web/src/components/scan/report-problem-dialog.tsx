"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ERROR_BORDER, Field, describedBy } from "@/components/forms/form-field";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@/components/ui";
import { useReportProblemMutation } from "@/lib/hooks/use-work-orders";
import { cn } from "@/lib/utils";

interface ReportProblemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  equipmentName: string;
  /** Pre-fills "where is it". */
  location: string;
  /** The device is already out of use; no need to offer taking it out. */
  alreadyOutOfUse: boolean;
  openWorkOrders: number;
}

/**
 * Ward staff tell biomed something is wrong, in their own words, in a few
 * seconds. Taking the device out of use is on by default: when in doubt,
 * the next person who scans it should see "Do not use".
 */
export function ReportProblemDialog({
  open,
  onOpenChange,
  assetId,
  equipmentName,
  location,
  alreadyOutOfUse,
  openWorkOrders,
}: ReportProblemDialogProps) {
  const [description, setDescription] = useState("");
  const [where, setWhere] = useState(location);
  const [takeOutOfUse, setTakeOutOfUse] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const mutation = useReportProblemMutation();

  const error = submitted && description.trim().length < 5 ? "Describe the problem in a few words" : undefined;

  const close = (next: boolean) => {
    if (!next) {
      setDescription("");
      setWhere(location);
      setTakeOutOfUse(true);
      setSubmitted(false);
      setServerError(undefined);
    }
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (description.trim().length < 5) return;
    try {
      const result = await mutation.mutateAsync({
        assetId,
        description: description.trim(),
        takeOutOfUse: !alreadyOutOfUse && takeOutOfUse,
        locationHint: where.trim() || undefined,
      });
      toast.success(
        result.takenOutOfUse
          ? "Reported. The device now shows as Do not use, and biomed has been told."
          : "Reported. Biomed has been told.",
      );
      close(false);
    } catch (err) {
      setServerError((err as Error).message || "Could not send the report. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>
            {equipmentName}. Biomedical engineering will see this in their work queue.
          </DialogDescription>
        </DialogHeader>

        {openWorkOrders > 0 && (
          <p className="rounded-xl border border-warning-500/40 bg-warning-500/10 p-3 text-sm text-gray-100">
            Biomed already has {openWorkOrders === 1 ? "an open work order" : `${openWorkOrders} open work orders`} for this
            device. Report again if this is a different or new problem.
          </p>
        )}

        <form onSubmit={submit} noValidate className="space-y-4">
          <Field field="problem-description" label="What's wrong?" required error={error}>
            <Textarea
              {...describedBy("problem-description", error)}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Low-pressure alarm keeps sounding; screen flickers"
              rows={3}
              maxLength={2000}
              autoFocus
              className={cn(error && ERROR_BORDER)}
            />
          </Field>
          <Field field="problem-where" label="Where is it now?">
            <Input
              {...describedBy("problem-where")}
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              placeholder="e.g. ICU bay 3"
              maxLength={255}
            />
          </Field>

          {alreadyOutOfUse ? (
            <p className="text-sm text-gray-300">This device is already marked as out of use.</p>
          ) : (
            <label className="flex items-start gap-3 rounded-xl border border-critical-500/40 bg-critical-500/10 p-3 text-sm text-gray-100">
              <input
                type="checkbox"
                checked={takeOutOfUse}
                onChange={(e) => setTakeOutOfUse(e.target.checked)}
                className="mt-1"
              />
              <span>
                <strong>Take it out of use now.</strong> Anyone who scans it will see &ldquo;Do not use&rdquo; until biomed
                releases it. Untick only for problems that don&apos;t affect patient safety.
              </span>
            </label>
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
            <Button type="submit" variant={takeOutOfUse && !alreadyOutOfUse ? "danger" : "primary"} disabled={mutation.isPending}>
              {mutation.isPending ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
