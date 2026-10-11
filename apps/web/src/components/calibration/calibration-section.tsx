"use client";

import { useState } from "react";
import { Gauge, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { ERROR_BORDER, Field, describedBy } from "@/components/forms/form-field";
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
import {
  PROVIDER_LABEL,
  type CalibrationRecord,
  type CalibrationResult,
} from "@/lib/api/calibration";
import type { AssetLookup } from "@/lib/api/assets";
import { useCalibrations, useCorrectCalibration, useRecordCalibration } from "@/lib/hooks/use-calibration";
import { cn, formatDate } from "@/lib/utils";

import {
  CalibrationFields,
  calibrationErrors,
  emptyCalibration,
  toCalibrationInput,
  type CalibrationFormValues,
} from "./calibration-fields";

const RESULT_BADGE: Record<CalibrationResult, { label: string; variant: "success" | "accent" | "critical" }> = {
  PASS: { label: "Passed", variant: "success" },
  ADJUSTED: { label: "Adjusted", variant: "accent" },
  FAIL: { label: "Failed", variant: "critical" },
};

const toDay = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** A record's values back in the form, for a correction. */
const toForm = (r: CalibrationRecord): CalibrationFormValues => ({
  calibratedAt: toDay(r.calibratedAt),
  provider: r.provider,
  providerName: r.providerName ?? "",
  labAccreditationNumber: r.labAccreditationNumber ?? "",
  certificateNumber: r.certificateNumber ?? "",
  validUntil: toDay(r.validUntil),
  measurementUncertainty: r.measurementUncertainty ?? "",
  referenceStandards: r.referenceStandards ?? "",
  result: r.result,
  notes: r.notes ?? "",
});

/** Record a calibration, or correct one (the original is kept, marked as corrected). */
function CalibrationDialog({
  assetId,
  equipmentName,
  correcting,
  onClose,
}: {
  assetId: string;
  equipmentName: string;
  correcting: CalibrationRecord | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState<CalibrationFormValues>(() => (correcting ? toForm(correcting) : emptyCalibration()));
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const record = useRecordCalibration(assetId);
  const correct = useCorrectCalibration();
  const saving = record.isPending || correct.isPending;
  const reasonError = correcting && submitted && reason.trim().length < 10 ? "Say why the record is being corrected" : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (Object.keys(calibrationErrors(values)).length || (correcting && reason.trim().length < 10)) return;
    try {
      const input = toCalibrationInput(values);
      if (correcting) {
        await correct.mutateAsync({ id: correcting.id, body: { ...input, correctionReason: reason.trim() } });
        toast.success("Correction recorded; the original is kept and marked as corrected");
      } else {
        await record.mutateAsync(input);
        toast.success(values.result === "FAIL" ? `Failed calibration recorded. ${equipmentName} is out of use.` : "Calibration recorded");
      }
      onClose();
    } catch (err) {
      setServerError((err as Error).message || "Could not save. Please try again.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{correcting ? "Correct calibration record" : "Record calibration"}</DialogTitle>
          <DialogDescription>
            {correcting
              ? "Records are never edited. Your correction is saved as a new record that replaces this one; the original stays on file."
              : `${equipmentName}. For a certificate you already have, or work done without a work order.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <CalibrationFields values={values} onChange={setValues} showErrors={submitted} idPrefix="dev-cal" />
          {correcting && (
            <Field field="cal-reason" label="Why is this being corrected?" required error={reasonError}>
              <Textarea
                {...describedBy("cal-reason", reasonError)}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Valid-until date was misread from the certificate"
                className={cn(reasonError && ERROR_BORDER)}
              />
            </Field>
          )}
          {serverError && (
            <p role="alert" className="text-sm text-critical-500">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Back
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : correcting ? "Save correction" : "Record calibration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordItem({ r, canCorrect, onCorrect }: { r: CalibrationRecord; canCorrect: boolean; onCorrect: () => void }) {
  const badge = RESULT_BADGE[r.result];
  const corrected = Boolean(r.correctedBy);
  const details = [
    r.providerName ? `${PROVIDER_LABEL[r.provider]}: ${r.providerName}` : PROVIDER_LABEL[r.provider],
    r.labAccreditationNumber ? `NABL ${r.labAccreditationNumber}` : null,
    r.certificateNumber ? `Certificate ${r.certificateNumber}` : null,
    r.validUntil ? `Valid until ${formatDate(r.validUntil)}` : null,
    r.measurementUncertainty ? `Uncertainty ${r.measurementUncertainty}` : null,
  ].filter(Boolean);

  return (
    <li className={cn("border-l-2 pl-3 text-sm", corrected ? "border-white/5 opacity-60" : "border-white/10")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-100">{formatDate(r.calibratedAt)}</span>
        <Badge size="sm" variant={badge.variant}>
          {badge.label}
        </Badge>
        {corrected && <Badge size="sm">Corrected</Badge>}
        {canCorrect && !corrected && (
          <Button size="sm" variant="ghost" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={onCorrect} className="ml-auto">
            Correct
          </Button>
        )}
      </div>
      <p className="text-gray-300">{details.join(" · ")}</p>
      {r.referenceStandards && <p className="text-gray-400">Reference: {r.referenceStandards}</p>}
      {r.notes && <p className="text-gray-300">{r.notes}</p>}
      {r.supersedesId && r.correctionReason && <p className="text-warning-500">Correction: {r.correctionReason}</p>}
      <p className="text-xs text-gray-500">
        Recorded {formatDate(r.recordedAt, "MMM d, yyyy HH:mm")} by {r.recordedBy}
        {r.workOrderId ? " · from a work order" : ""}
      </p>
    </li>
  );
}

/** A device's calibration status and certificates; biomed can record and correct. */
export function CalibrationSection({
  assetId,
  equipmentName,
  calibration,
  canRecord,
}: {
  assetId: string;
  equipmentName: string;
  calibration: AssetLookup["calibration"];
  canRecord: boolean;
}) {
  const records = useCalibrations(assetId);
  const [dialog, setDialog] = useState<{ correcting: CalibrationRecord | null } | null>(null);
  if (!calibration && !canRecord && !records.data?.length) return null;

  return (
    <section aria-labelledby="calibration-heading" className="rounded-2xl border border-white/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="calibration-heading" className="flex items-center gap-2 font-medium text-gray-200">
          <Gauge className="h-4 w-4" aria-hidden="true" /> Calibration
        </h2>
        {canRecord && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setDialog({ correcting: null })}
            className="ml-auto"
          >
            Record calibration
          </Button>
        )}
      </div>

      {calibration ? (
        <p className="mt-2 text-sm text-gray-300">
          {calibration.nextCalibrationDue ? (
            <>
              Next due <strong className={cn(calibration.overdue && "text-warning-500")}>{formatDate(calibration.nextCalibrationDue)}</strong>
              {calibration.overdue ? " (overdue)" : ""}
            </>
          ) : (
            "No due date set"
          )}
          {calibration.lastCalibrationDate ? ` · last calibrated ${formatDate(calibration.lastCalibrationDate)}` : ""}
          {calibration.lastResult ? ` · ${RESULT_BADGE[calibration.lastResult].label.toLowerCase()}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-sm text-gray-500">
          Not in the calibration programme.{canRecord ? " Recording a calibration adds it." : ""}
        </p>
      )}

      {records.isPending ? (
        <Skeleton className="mt-3 h-12 w-full" />
      ) : records.data && records.data.length > 0 ? (
        <ol className="mt-3 space-y-3">
          {records.data.map((r) => (
            <RecordItem key={r.id} r={r} canCorrect={canRecord} onCorrect={() => setDialog({ correcting: r })} />
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-gray-500">No calibration records yet.</p>
      )}

      {dialog && (
        <CalibrationDialog
          assetId={assetId}
          equipmentName={equipmentName}
          correcting={dialog.correcting}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
