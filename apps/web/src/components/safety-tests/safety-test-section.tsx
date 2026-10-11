"use client";

import { useState } from "react";
import { Pencil, Plus, Zap } from "lucide-react";
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
import type { AssetLookup } from "@/lib/api/assets";
import { PROVIDER_LABEL } from "@/lib/api/calibration";
import {
  APPLIED_PART_LABEL,
  CLASS_LABEL,
  METHOD_LABEL,
  REASON_LABEL,
  type SafetyTestRecord,
} from "@/lib/api/safety-tests";
import { useCorrectSafetyTest, useRecordSafetyTest, useSafetyTests } from "@/lib/hooks/use-safety-tests";
import { cn, formatDate } from "@/lib/utils";

import {
  SafetyTestFields,
  emptySafetyTest,
  expectedResult,
  safetyTestErrors,
  toSafetyTestInput,
  type SafetyTestFormValues,
} from "./safety-test-fields";

const str = (n: number | null) => (n === null ? "" : String(n));

/** A record's values back in the form, for a correction. */
const toForm = (r: SafetyTestRecord): SafetyTestFormValues => ({
  testedAt: r.testedAt.slice(0, 10),
  reason: r.reason,
  provider: r.provider,
  providerName: r.providerName ?? "",
  analyzer: r.analyzer,
  electricalClass: r.electricalClass,
  appliedPartType: r.appliedPartType,
  leakageMethod: r.leakageMethod,
  medicalSystem: r.medicalSystem,
  mobileXray: r.mobileXray,
  defibrillationPaddles: r.defibrillationPaddles,
  visualInspection: r.visualInspectionPassed ? "pass" : "fail",
  functionalTest: r.functionalTestPassed ? "pass" : "fail",
  earthResistanceOhm: str(r.earthResistanceOhm),
  insulationMainsMOhm: str(r.insulationMainsMOhm),
  insulationAppliedMOhm: str(r.insulationAppliedMOhm),
  equipmentLeakageUa: str(r.equipmentLeakageUa),
  appliedPartLeakageUa: str(r.appliedPartLeakageUa),
  notes: r.notes ?? "",
});

/** Record a test, or correct one (the original is kept, marked as corrected). */
function SafetyTestDialog({
  assetId,
  device,
  correcting,
  onClose,
}: {
  assetId: string;
  device: Pick<AssetLookup, "equipmentName" | "electricalClass" | "appliedPartType">;
  correcting: SafetyTestRecord | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState<SafetyTestFormValues>(() =>
    correcting ? toForm(correcting) : { ...emptySafetyTest(device), reason: "AFTER_REPAIR" },
  );
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const record = useRecordSafetyTest(assetId);
  const correct = useCorrectSafetyTest();
  const saving = record.isPending || correct.isPending;
  const reasonError = correcting && submitted && reason.trim().length < 10 ? "Say why the record is being corrected" : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (Object.keys(safetyTestErrors(values)).length || (correcting && reason.trim().length < 10)) return;
    try {
      const input = toSafetyTestInput(values);
      if (correcting) {
        await correct.mutateAsync({ id: correcting.id, body: { ...input, correctionReason: reason.trim() } });
        toast.success("Correction recorded; the original is kept and marked as corrected");
      } else {
        const saved = await record.mutateAsync(input);
        toast.success(
          saved.passed ? "Safety test recorded" : `Failed safety test recorded. ${device.equipmentName} is out of use.`,
        );
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
          <DialogTitle>{correcting ? "Correct safety test record" : "Record electrical safety test"}</DialogTitle>
          <DialogDescription>
            {correcting
              ? "Records are never edited. Your correction is saved as a new record that replaces this one; the original stays on file."
              : `${device.equipmentName}. For a test after a repair, at acceptance, or done without a work order.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <SafetyTestFields values={values} onChange={setValues} showErrors={submitted} idPrefix="dev-est" />
          {correcting && (
            <Field field="est-reason" label="Why is this being corrected?" required error={reasonError}>
              <Textarea
                {...describedBy("est-reason", reasonError)}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Earth resistance was 0.045 Ω, typed as 4.5"
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
            <Button type="submit" variant={expectedResult(values)?.passed === false ? "danger" : "primary"} disabled={saving}>
              {saving ? "Saving…" : correcting ? "Save correction" : "Record test"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordItem({ r, canCorrect, onCorrect }: { r: SafetyTestRecord; canCorrect: boolean; onCorrect: () => void }) {
  const corrected = Boolean(r.correctedBy);
  const details = [
    REASON_LABEL[r.reason],
    r.providerName ? `${PROVIDER_LABEL[r.provider]}: ${r.providerName}` : PROVIDER_LABEL[r.provider],
    CLASS_LABEL[r.electricalClass],
    APPLIED_PART_LABEL[r.appliedPartType],
    r.electricalClass !== "INTERNALLY_POWERED" ? `${METHOD_LABEL[r.leakageMethod]} method` : null,
  ].filter(Boolean);
  const readings = r.checks.filter((c) => c.rule !== "pass" && c.value !== null);
  const failed = r.checks.filter((c) => c.passed === false);

  return (
    <li className={cn("border-l-2 pl-3 text-sm", corrected ? "border-white/5 opacity-60" : "border-white/10")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-100">{formatDate(r.testedAt)}</span>
        <Badge size="sm" variant={r.passed ? "success" : "critical"}>
          {r.passed ? "Passed" : "Failed"}
        </Badge>
        {corrected && <Badge size="sm">Corrected</Badge>}
        {canCorrect && !corrected && (
          <Button size="sm" variant="ghost" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={onCorrect} className="ml-auto">
            Correct
          </Button>
        )}
      </div>
      <p className="text-gray-300">{details.join(" · ")}</p>
      {readings.length > 0 && (
        <ul className="text-gray-300">
          {readings.map((c) => (
            <li key={c.key} className={cn(c.passed === false && "text-critical-500")}>
              {c.label}: {c.value} {c.unit} ({c.rule === "max" ? "≤" : "≥"} {c.limit})
            </li>
          ))}
        </ul>
      )}
      {failed.some((c) => c.rule === "pass") && (
        <p className="text-critical-500">
          {failed
            .filter((c) => c.rule === "pass")
            .map((c) => `${c.label} failed`)
            .join(" · ")}
        </p>
      )}
      <p className="text-gray-400">Analyser: {r.analyzer}</p>
      {r.notes && <p className="text-gray-300">{r.notes}</p>}
      {r.supersedesId && r.correctionReason && <p className="text-warning-500">Correction: {r.correctionReason}</p>}
      <p className="text-xs text-gray-500">
        Recorded {formatDate(r.recordedAt, "MMM d, yyyy HH:mm")} by {r.recordedBy}
        {r.workOrderId ? " · from a work order" : ""}
      </p>
    </li>
  );
}

/** A device's electrical safety tests (IS/IEC 62353); biomed can record and correct. */
export function SafetyTestSection({
  assetId,
  device,
  canRecord,
}: {
  assetId: string;
  device: Pick<AssetLookup, "equipmentName" | "safetyTest" | "electricalClass" | "appliedPartType">;
  canRecord: boolean;
}) {
  const records = useSafetyTests(assetId);
  const [dialog, setDialog] = useState<{ correcting: SafetyTestRecord | null } | null>(null);
  const status = device.safetyTest;
  if (!status && !canRecord && !records.data?.length) return null;

  return (
    <section aria-labelledby="safety-test-heading" className="rounded-2xl border border-white/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="safety-test-heading" className="flex items-center gap-2 font-medium text-gray-200">
          <Zap className="h-4 w-4" aria-hidden="true" /> Electrical safety
        </h2>
        {canRecord && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setDialog({ correcting: null })}
            className="ml-auto"
          >
            Record safety test
          </Button>
        )}
      </div>

      {status ? (
        <p className="mt-2 text-sm text-gray-300">
          {status.nextTestDue ? (
            <>
              Next due <strong className={cn(status.overdue && "text-warning-500")}>{formatDate(status.nextTestDue)}</strong>
              {status.overdue ? " (overdue)" : ""}
            </>
          ) : (
            "No due date set"
          )}
          {status.lastTestDate ? ` · last tested ${formatDate(status.lastTestDate)}` : ""}
          {status.lastPassed === false ? " · failed" : status.lastPassed ? " · passed" : ""}
          {device.electricalClass ? ` · ${CLASS_LABEL[device.electricalClass]}` : ""}
          {device.appliedPartType ? `, ${APPLIED_PART_LABEL[device.appliedPartType]}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-sm text-gray-500">
          Not in the electrical safety test programme.{canRecord ? " Recording a test adds it." : ""}
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
        <p className="mt-2 text-sm text-gray-500">No safety test records yet.</p>
      )}

      {dialog && (
        <SafetyTestDialog
          assetId={assetId}
          device={device}
          correcting={dialog.correcting}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
