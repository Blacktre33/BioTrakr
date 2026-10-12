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
  Input,
  Textarea,
} from "@/components/ui";
import {
  CONDEMNATION_REASONS,
  DISPOSAL_LABEL,
  type Condemnation,
  type CondemnationEvidence,
  type CondemnationFile,
  type CondemnationReason,
  type DisposalMethod,
} from "@/lib/api/condemnation";
import {
  amount,
  clearanceNeeded,
  evidenceText,
  proposalErrors,
  repairShare,
  todayValue,
  type ProposalValues,
} from "@/lib/condemnation";
import { useCondemnationStep } from "@/lib/hooks/use-condemnation";
import { cn, formatCurrency } from "@/lib/utils";

const failed = (err: unknown) => (err as Error).message || "Could not save. Please try again.";

function ServerError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm text-critical-500">
      {message}
    </p>
  ) : null;
}

function Footer({ pending, onClose, label }: { pending: boolean; onClose: () => void; label: string }) {
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
        Back
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
    </DialogFooter>
  );
}

/** Biomed puts a device up for condemnation, with the reasons and the evidence. */
export function ProposeDialog({
  assetId,
  equipmentName,
  evidence,
  onClose,
}: {
  assetId: string;
  equipmentName: string;
  evidence: CondemnationEvidence;
  onClose: () => void;
}) {
  const [values, setValues] = useState<ProposalValues>({
    reasons: [],
    justification: "",
    repairEstimate: "",
    currentValue: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const step = useCondemnationStep();
  const errors = proposalErrors(values);
  const show = (k: keyof ProposalValues) => (submitted ? errors[k] : undefined);
  const repair = amount(values.repairEstimate) ?? null;
  const value = amount(values.currentValue) ?? null;
  const share = repairShare(repair, value ?? evidence.bookValue);

  const toggle = (r: CondemnationReason, on: boolean) =>
    setValues({ ...values, reasons: on ? [...values.reasons, r] : values.reasons.filter((x) => x !== r) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (Object.keys(errors).length) return;
    try {
      await step.mutateAsync({
        kind: "propose",
        body: {
          assetId,
          reasons: values.reasons,
          justification: values.justification.trim(),
          ...(repair !== null ? { repairEstimate: repair } : {}),
          ...(value !== null ? { currentValue: value } : {}),
        },
      });
      toast.success(`${equipmentName} is proposed for condemnation`);
      onClose();
    } catch (err) {
      setServerError(failed(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Propose for condemnation</DialogTitle>
          <DialogDescription>
            {equipmentName}: {evidenceText(evidence)}. It stays as it is until the committee approves.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <fieldset aria-describedby={show("reasons") ? "cd-reasons-error" : undefined}>
            <legend className="mb-1.5 text-sm font-medium text-gray-200">
              Reasons
              <span aria-hidden="true" className="text-critical-500">
                {" "}
                *
              </span>
            </legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(Object.keys(CONDEMNATION_REASONS) as CondemnationReason[]).map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={values.reasons.includes(r)}
                    onChange={(e) => toggle(r, e.target.checked)}
                  />
                  {CONDEMNATION_REASONS[r]}
                </label>
              ))}
            </div>
            {show("reasons") && (
              <p id="cd-reasons-error" role="alert" className="mt-1 text-sm text-critical-500">
                {show("reasons")}
              </p>
            )}
          </fieldset>

          <Field
            field="cd-justification"
            label="Why"
            required
            error={show("justification")}
            hint="The fault, what a repair needs, the vendor's advice"
          >
            <Textarea
              {...describedBy(
                "cd-justification",
                show("justification"),
                "The fault, what a repair needs, the vendor's advice",
              )}
              rows={4}
              maxLength={4000}
              value={values.justification}
              onChange={(e) => setValues({ ...values, justification: e.target.value })}
              className={cn(show("justification") && ERROR_BORDER)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field field="cd-repair" label="Repair estimate (₹)" error={show("repairEstimate")}>
              <Input
                {...describedBy("cd-repair", show("repairEstimate"))}
                inputMode="decimal"
                value={values.repairEstimate}
                onChange={(e) => setValues({ ...values, repairEstimate: e.target.value })}
                className={cn(show("repairEstimate") && ERROR_BORDER)}
              />
            </Field>
            <Field
              field="cd-value"
              label="Value now (₹)"
              error={show("currentValue")}
              hint={`Empty: the book value, ${formatCurrency(evidence.bookValue)}`}
            >
              <Input
                {...describedBy(
                  "cd-value",
                  show("currentValue"),
                  `Empty: the book value, ${formatCurrency(evidence.bookValue)}`,
                )}
                inputMode="decimal"
                value={values.currentValue}
                onChange={(e) => setValues({ ...values, currentValue: e.target.value })}
                className={cn(show("currentValue") && ERROR_BORDER)}
              />
            </Field>
          </div>
          {share !== null && (
            <p role="status" className={cn("text-sm", share >= 50 ? "text-warning-500" : "text-gray-300")}>
              The repair would cost {share}% of what the device is worth.
            </p>
          )}

          <ServerError message={serverError} />
          <Footer pending={step.isPending} onClose={onClose} label="Propose" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** An administrator records what the committee decided. */
export function DecideDialog({
  c,
  equipmentName,
  onClose,
}: {
  c: Condemnation;
  equipmentName: string;
  onClose: () => void;
}) {
  const [decision, setDecision] = useState<"" | "APPROVED" | "REJECTED">("");
  const [committee, setCommittee] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const step = useCondemnationStep();
  const errors = {
    decision: decision ? undefined : "Choose the committee's decision",
    committee: committee.trim().length < 5 ? "Name the committee meeting: its date and minute number" : undefined,
    note: decision === "REJECTED" && !note.trim() ? "Say why the committee didn't approve it" : undefined,
  };
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (errors.decision || errors.committee || errors.note || !decision) return;
    try {
      await step.mutateAsync({
        kind: "decide",
        id: c.id,
        body: { decision, committee: committee.trim(), ...(note.trim() ? { note: note.trim() } : {}) },
      });
      toast.success(decision === "APPROVED" ? `${equipmentName} is condemned` : "The committee's decision is recorded");
      onClose();
    } catch (err) {
      setServerError(failed(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>The committee&apos;s decision</DialogTitle>
          <DialogDescription>
            Approving condemns {equipmentName}: it goes out of use for good and its open work orders are cancelled.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <fieldset aria-describedby={show("decision") ? "cd-decision-error" : undefined}>
            <legend className="mb-1.5 text-sm font-medium text-gray-200">Decision</legend>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ["APPROVED", "Approved: condemn it"],
                  ["REJECTED", "Not approved"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-gray-200">
                  <input
                    type="radio"
                    name="cd-decision"
                    checked={decision === value}
                    onChange={() => setDecision(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {show("decision") && (
              <p id="cd-decision-error" role="alert" className="mt-1 text-sm text-critical-500">
                {show("decision")}
              </p>
            )}
          </fieldset>
          <Field field="cd-committee" label="Committee meeting" required error={show("committee")}>
            <Input
              {...describedBy("cd-committee", show("committee"))}
              value={committee}
              maxLength={500}
              placeholder="Equipment committee, 14 Oct 2026, minute 6"
              onChange={(e) => setCommittee(e.target.value)}
              className={cn(show("committee") && ERROR_BORDER)}
            />
          </Field>
          <Field
            field="cd-note"
            label={decision === "REJECTED" ? "Why not" : "Note"}
            required={decision === "REJECTED"}
            error={show("note")}
          >
            <Textarea
              {...describedBy("cd-note", show("note"))}
              rows={3}
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={cn(show("note") && ERROR_BORDER)}
            />
          </Field>
          <ServerError message={serverError} />
          <Footer pending={step.isPending} onClose={onClose} label="Record decision" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Withdraw a proposal, or (administrators) reverse an approval. */
export function WithdrawDialog({ c, onClose }: { c: Condemnation; onClose: () => void }) {
  const reversing = c.status === "APPROVED";
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const step = useCondemnationStep();
  const error = submitted && reason.trim().length < 5 ? "Say why (at least a few words)" : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (reason.trim().length < 5) return;
    try {
      await step.mutateAsync({ kind: "withdraw", id: c.id, reason: reason.trim() });
      toast.success(reversing ? "Condemnation reversed" : "Proposal withdrawn");
      onClose();
    } catch (err) {
      setServerError(failed(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{reversing ? "Reverse the condemnation" : "Withdraw the proposal"}</DialogTitle>
          <DialogDescription>
            {reversing
              ? "The committee's decision stays on file. The device goes back to out of use until biomed checks it and releases it."
              : "It stays on file, marked withdrawn."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field field="cd-withdraw" label="Reason" required error={error}>
            <Textarea
              {...describedBy("cd-withdraw", error)}
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={cn(error && ERROR_BORDER)}
            />
          </Field>
          <ServerError message={serverError} />
          <Footer pending={step.isPending} onClose={onClose} label={reversing ? "Reverse" : "Withdraw"} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The condemned device leaves the hospital. */
export function DisposeDialog({
  c,
  equipmentName,
  clearance,
  onClose,
}: {
  c: Condemnation;
  equipmentName: string;
  clearance: CondemnationFile["clearance"];
  onClose: () => void;
}) {
  const [method, setMethod] = useState<DisposalMethod>("E_WASTE_RECYCLER");
  const [disposedOn, setDisposedOn] = useState(todayValue());
  const [note, setNote] = useState("");
  const [given, setGiven] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const step = useCondemnationStep();
  const decided = c.decidedAt ? new Date(c.decidedAt).toLocaleDateString("en-CA") : "";
  const needed = clearanceNeeded(clearance?.kind, method);
  const errors = {
    disposedOn: !disposedOn
      ? "Enter the date it left the hospital"
      : disposedOn > todayValue()
        ? "The disposal date is in the future"
        : disposedOn < decided
          ? "The disposal date is before the committee's decision"
          : undefined,
    note: note.trim().length < 5 ? "Say who took it, and the certificate or receipt number" : undefined,
    clearance: needed && given.trim().length < 5 ? "Give the reference and date" : undefined,
  };
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (errors.disposedOn || errors.note || errors.clearance) return;
    try {
      await step.mutateAsync({
        kind: "dispose",
        id: c.id,
        body: { method, disposedOn, note: note.trim(), ...(given.trim() ? { clearance: given.trim() } : {}) },
      });
      toast.success(`${equipmentName} is recorded as disposed of`);
      onClose();
    } catch (err) {
      setServerError(failed(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record the disposal</DialogTitle>
          <DialogDescription>{equipmentName} leaves the hospital; this cannot be undone here.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field field="cd-method" label="How" required>
              <select
                {...describedBy("cd-method")}
                value={method}
                onChange={(e) => setMethod(e.target.value as DisposalMethod)}
                className={SELECT_CLASS}
              >
                {(Object.keys(DISPOSAL_LABEL) as DisposalMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {DISPOSAL_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field field="cd-date" label="Date" required error={show("disposedOn")}>
              <Input
                {...describedBy("cd-date", show("disposedOn"))}
                type="date"
                max={todayValue()}
                min={decided || undefined}
                value={disposedOn}
                onChange={(e) => setDisposedOn(e.target.value)}
                className={cn(show("disposedOn") && ERROR_BORDER)}
              />
            </Field>
          </div>
          <Field
            field="cd-disposal-note"
            label="Taken by"
            required
            error={show("note")}
            hint="Recycler, buyer or institution, and the certificate, receipt or order number"
          >
            <Textarea
              {...describedBy(
                "cd-disposal-note",
                show("note"),
                "Recycler, buyer or institution, and the certificate, receipt or order number",
              )}
              rows={3}
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={cn(show("note") && ERROR_BORDER)}
            />
          </Field>
          {clearance && (
            <Field
              field="cd-clearance"
              label={clearance.kind === "aerb" ? "AERB decommissioning approval" : "PC-PNDT NOC"}
              required={needed}
              error={show("clearance")}
              hint={clearance.text}
            >
              <Input
                {...describedBy("cd-clearance", show("clearance"), clearance.text)}
                value={given}
                maxLength={500}
                placeholder="Reference number and date"
                onChange={(e) => setGiven(e.target.value)}
                className={cn(show("clearance") && ERROR_BORDER)}
              />
            </Field>
          )}
          <ServerError message={serverError} />
          <Footer pending={step.isPending} onClose={onClose} label="Record disposal" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
