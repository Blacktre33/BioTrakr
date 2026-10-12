"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DevicePicker, type PickedDevice } from "@/components/contracts/device-picker";
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
  ASSESSMENT_LABEL,
  KIND_LABEL,
  type TrainingAssessment,
  type TrainingKind,
  type TrainingSession,
} from "@/lib/api/training";
import { useSaveTraining } from "@/lib/hooks/use-training";
import {
  blankAttendee,
  emptyTraining,
  toTrainingInput,
  todayValue,
  trainingErrors,
  valuesFrom,
  type AttendeeRow,
  type TrainingValues,
} from "@/lib/training";
import { cn } from "@/lib/utils";

/**
 * Records a training session, or corrects one: what it covered, the trainer,
 * and who attended as on the attendance sheet, with how each was assessed.
 */
export function TrainingDialog({
  session,
  devices,
  onClose,
}: {
  /** The session to correct; a new one when absent. */
  session?: TrainingSession;
  /** Devices to start with, for a new session from a device page. */
  devices?: PickedDevice[];
  onClose: () => void;
}) {
  const [values, setValues] = useState<TrainingValues>(() => (session ? valuesFrom(session) : emptyTraining(devices)));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const save = useSaveTraining();
  const listRef = useRef<HTMLOListElement>(null);
  const errors = trainingErrors(values);
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : undefined);
  const set = (patch: Partial<TrainingValues>) => setValues({ ...values, ...patch });
  const setPerson = (rowId: number, patch: Partial<AttendeeRow>) =>
    set({ attendees: values.attendees.map((a) => (a.rowId === rowId ? { ...a, ...patch } : a)) });
  const addPerson = () => {
    set({ attendees: [...values.attendees, blankAttendee()] });
    // Straight on to the new name.
    setTimeout(() => listRef.current?.querySelector<HTMLInputElement>("li:last-child input")?.focus());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (Object.keys(errors).length) return;
    try {
      await save.mutateAsync({ id: session?.id, body: toTrainingInput(values) });
      toast.success(session ? "Training corrected" : "Training recorded");
      onClose();
    } catch (err) {
      const message = (err as { details?: { message?: string | string[] } }).details?.message;
      setServerError(Array.isArray(message) ? message.join(". ") : (err as Error).message || "Could not save");
    }
  };

  const text = (
    field: string,
    label: string,
    key: "topic" | "equipment" | "trainer" | "trainerFrom",
    opts: { required?: boolean; max: number; placeholder?: string; hint?: string },
  ) => {
    const error = key === "trainerFrom" ? undefined : show(key);
    return (
      <Field field={field} label={label} required={opts.required} error={error} hint={opts.hint}>
        <Input
          {...describedBy(field, error, opts.hint)}
          value={values[key]}
          maxLength={opts.max}
          placeholder={opts.placeholder}
          onChange={(e) => set({ [key]: e.target.value })}
          className={cn(error && ERROR_BORDER)}
        />
      </Field>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{session ? "Correct training" : "Record training"}</DialogTitle>
          <DialogDescription>
            Who was trained on which equipment, by whom, and how each person was assessed. Attach the signed attendance
            sheet once it is saved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr_1fr]">
            <Field field="tr-date" label="Date" required error={show("heldOn")}>
              <Input
                {...describedBy("tr-date", show("heldOn"))}
                type="date"
                max={todayValue()}
                value={values.heldOn}
                onChange={(e) => set({ heldOn: e.target.value })}
                className={cn(show("heldOn") && ERROR_BORDER)}
              />
            </Field>
            <Field field="tr-kind" label="Kind" required>
              <select
                {...describedBy("tr-kind")}
                value={values.kind}
                onChange={(e) => set({ kind: e.target.value as TrainingKind })}
                className={SELECT_CLASS}
              >
                {(Object.keys(KIND_LABEL) as TrainingKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field field="tr-hours" label="Hours" error={show("hours")}>
              <Input
                {...describedBy("tr-hours", show("hours"))}
                inputMode="decimal"
                value={values.hours}
                placeholder="1.5"
                onChange={(e) => set({ hours: e.target.value })}
                className={cn(show("hours") && ERROR_BORDER)}
              />
            </Field>
          </div>
          {text("tr-topic", "What it covered", "topic", {
            required: true,
            max: 300,
            placeholder: "Setting up, alarms, cleaning between patients",
          })}
          <div className="grid gap-4 sm:grid-cols-3">
            {text("tr-equipment", "Equipment", "equipment", {
              required: true,
              max: 200,
              placeholder: "Hamilton C1 ventilators",
            })}
            {text("tr-trainer", "Trainer", "trainer", { required: true, max: 200 })}
            {text("tr-from", "Trainer from", "trainerFrom", {
              max: 200,
              placeholder: "In-house, or the vendor",
            })}
          </div>
          <Field field="tr-devices" label="Particular devices covered" hint="Optional: the units used in the training">
            <DevicePicker
              id="tr-devices"
              value={values.devices}
              onChange={(devices) => set({ devices })}
              describedBy="tr-devices-hint"
            />
          </Field>

          <fieldset aria-describedby={show("attendees") ? "tr-attendees-error" : undefined}>
            <legend className="mb-1.5 text-sm font-medium text-gray-200">
              Who attended
              <span aria-hidden="true" className="text-critical-500">
                {" "}
                *
              </span>
            </legend>
            <ol ref={listRef} className="space-y-2">
              {values.attendees.map((a, n) => (
                <li key={a.rowId} className="grid gap-2 sm:grid-cols-[2fr_1.2fr_1.2fr_1.7fr_auto]">
                  <Input
                    aria-label={`Person ${n + 1}: name`}
                    placeholder="Name"
                    maxLength={200}
                    value={a.name}
                    onChange={(e) => setPerson(a.rowId, { name: e.target.value })}
                  />
                  <Input
                    aria-label={`Person ${n + 1}: designation`}
                    placeholder="Designation"
                    maxLength={120}
                    value={a.designation}
                    onChange={(e) => setPerson(a.rowId, { designation: e.target.value })}
                  />
                  <Input
                    aria-label={`Person ${n + 1}: department`}
                    placeholder="Department"
                    maxLength={120}
                    value={a.department}
                    onChange={(e) => setPerson(a.rowId, { department: e.target.value })}
                  />
                  <select
                    aria-label={`Person ${n + 1}: assessment`}
                    value={a.assessment}
                    onChange={(e) => setPerson(a.rowId, { assessment: e.target.value as TrainingAssessment })}
                    className={SELECT_CLASS}
                  >
                    {(Object.keys(ASSESSMENT_LABEL) as TrainingAssessment[]).map((k) => (
                      <option key={k} value={k}>
                        {ASSESSMENT_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove person ${n + 1}`}
                    disabled={values.attendees.length === 1}
                    onClick={() => set({ attendees: values.attendees.filter((x) => x.rowId !== a.rowId) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-2"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={addPerson}
            >
              Add person
            </Button>
            {show("attendees") && (
              <p id="tr-attendees-error" role="alert" className="mt-1 text-sm text-critical-500">
                {show("attendees")}
              </p>
            )}
          </fieldset>

          <Field field="tr-notes" label="Notes">
            <Textarea
              {...describedBy("tr-notes")}
              rows={2}
              maxLength={4000}
              value={values.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </Field>

          {serverError && (
            <p role="alert" className="text-sm text-critical-500">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
              Back
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : session ? "Save correction" : "Record training"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
