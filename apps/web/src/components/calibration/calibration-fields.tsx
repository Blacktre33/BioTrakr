"use client";

import { ERROR_BORDER, Field, SELECT_CLASS, describedBy } from "@/components/forms/form-field";
import { Input, Textarea } from "@/components/ui";
import {
  PROVIDER_LABEL,
  RESULT_LABEL,
  calibrationProblems,
  type CalibrationInput,
  type CalibrationResult,
  type ServiceProvider,
} from "@/lib/api/calibration";
import { cn } from "@/lib/utils";

/** What the form holds; dates are YYYY-MM-DD from date inputs. */
export interface CalibrationFormValues {
  calibratedAt: string;
  provider: ServiceProvider;
  providerName: string;
  labAccreditationNumber: string;
  certificateNumber: string;
  validUntil: string;
  measurementUncertainty: string;
  referenceStandards: string;
  result: CalibrationResult;
  notes: string;
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const emptyCalibration = (): CalibrationFormValues => ({
  calibratedAt: today(),
  provider: "EXTERNAL_LAB",
  providerName: "",
  labAccreditationNumber: "",
  certificateNumber: "",
  validUntil: "",
  measurementUncertainty: "",
  referenceStandards: "",
  result: "PASS",
  notes: "",
});

/** Midday local time, so the date is the same wherever the server runs. */
const dayToIso = (day: string) => (day ? new Date(`${day}T12:00:00`).toISOString() : "");

/** Only the fields that apply to who did the work are sent. */
export function toCalibrationInput(v: CalibrationFormValues): CalibrationInput {
  const opt = (s: string) => s.trim() || undefined;
  const external = v.provider === "EXTERNAL_LAB";
  return {
    calibratedAt: dayToIso(v.calibratedAt),
    provider: v.provider,
    providerName: v.provider === "IN_HOUSE" ? undefined : opt(v.providerName),
    labAccreditationNumber: external ? opt(v.labAccreditationNumber) : undefined,
    certificateNumber: v.provider === "IN_HOUSE" ? undefined : opt(v.certificateNumber),
    // A failed calibration is due again at once; a stale date would mislead.
    validUntil: v.result !== "FAIL" && v.validUntil ? dayToIso(v.validUntil) : undefined,
    measurementUncertainty: external ? opt(v.measurementUncertainty) : undefined,
    referenceStandards: v.provider === "IN_HOUSE" ? opt(v.referenceStandards) : undefined,
    result: v.result,
    notes: opt(v.notes),
  };
}

/** Which field each rule's message belongs to (the rules live in calibrationProblems). */
const FIELD_OF: Record<string, keyof CalibrationFormValues> = {
  "Enter the calibration date": "calibratedAt",
  "The calibration date cannot be in the future": "calibratedAt",
  '"Valid until" must be after the calibration date': "validUntil",
  "Name the laboratory": "providerName",
  "Name the manufacturer or vendor": "providerName",
  "Enter the laboratory's NABL accreditation number": "labAccreditationNumber",
  "Enter the calibration certificate number": "certificateNumber",
  "Enter the measurement uncertainty stated on the certificate": "measurementUncertainty",
  "Say which reference equipment was used, and its own calibration": "referenceStandards",
  "Say what was out of tolerance": "notes",
};

export function calibrationErrors(v: CalibrationFormValues): Partial<Record<keyof CalibrationFormValues, string>> {
  const errors: Partial<Record<keyof CalibrationFormValues, string>> = {};
  for (const message of calibrationProblems(toCalibrationInput(v))) {
    const field = FIELD_OF[message];
    if (field && !errors[field]) errors[field] = message;
  }
  return errors;
}

/** The calibration part of a form: who did it, the certificate, and the result. */
export function CalibrationFields({
  values,
  onChange,
  showErrors,
  idPrefix = "cal",
}: {
  values: CalibrationFormValues;
  onChange: (next: CalibrationFormValues) => void;
  showErrors: boolean;
  idPrefix?: string;
}) {
  const errors = showErrors ? calibrationErrors(values) : {};
  const id = (k: string) => `${idPrefix}-${k}`;
  const set =
    (k: keyof CalibrationFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange({ ...values, [k]: e.target.value });
  const text = (k: keyof CalibrationFormValues, label: string, opts: { required?: boolean; hint?: string; placeholder?: string; maxLength: number }) => (
    <Field field={id(k)} label={label} required={opts.required} error={errors[k]} hint={opts.hint}>
      <Input
        {...describedBy(id(k), errors[k], opts.hint)}
        value={values[k]}
        onChange={set(k)}
        maxLength={opts.maxLength}
        placeholder={opts.placeholder}
        className={cn(errors[k] && ERROR_BORDER)}
      />
    </Field>
  );
  const external = values.provider === "EXTERNAL_LAB";
  const vendor = values.provider === "VENDOR";
  const failed = values.result === "FAIL";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field field={id("provider")} label="Calibrated by" required>
          <select {...describedBy(id("provider"))} value={values.provider} onChange={set("provider")} className={SELECT_CLASS}>
            {(Object.keys(PROVIDER_LABEL) as ServiceProvider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field field={id("calibratedAt")} label="Date calibrated" required error={errors.calibratedAt}>
          <Input
            {...describedBy(id("calibratedAt"), errors.calibratedAt)}
            type="date"
            max={today()}
            value={values.calibratedAt}
            onChange={set("calibratedAt")}
            className={cn(errors.calibratedAt && ERROR_BORDER)}
          />
        </Field>
      </div>

      {(external || vendor) &&
        text("providerName", external ? "Laboratory" : "Manufacturer or vendor", { required: true, maxLength: 200 })}
      {external && (
        <div className="grid gap-4 sm:grid-cols-2">
          {text("labAccreditationNumber", "NABL accreditation no.", { required: true, maxLength: 100, placeholder: "CC-1234" })}
          {text("certificateNumber", "Certificate no.", { required: true, maxLength: 100 })}
        </div>
      )}
      {vendor && text("certificateNumber", "Certificate or service report no.", { maxLength: 100 })}
      {external &&
        text("measurementUncertainty", "Measurement uncertainty", {
          required: true,
          maxLength: 500,
          placeholder: "±0.5 mmHg (k=2)",
          hint: "As stated on the certificate",
        })}
      {values.provider === "IN_HOUSE" && (
        <Field
          field={id("referenceStandards")}
          label="Reference equipment used"
          required
          error={errors.referenceStandards}
          hint="Make, model and serial, and when it was last calibrated"
        >
          <Textarea
            {...describedBy(id("referenceStandards"), errors.referenceStandards, "Make, model and serial, and when it was last calibrated")}
            value={values.referenceStandards}
            onChange={set("referenceStandards")}
            rows={2}
            maxLength={1000}
            placeholder="Fluke ProSim 8, SN 1234567, calibrated March 2026"
            className={cn(errors.referenceStandards && ERROR_BORDER)}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field field={id("result")} label="Result" required>
          <select {...describedBy(id("result"))} value={values.result} onChange={set("result")} className={SELECT_CLASS}>
            {(Object.keys(RESULT_LABEL) as CalibrationResult[]).map((r) => (
              <option key={r} value={r}>
                {RESULT_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        {!failed && (
          <Field
            field={id("validUntil")}
            label="Valid until"
            error={errors.validUntil}
            hint="From the certificate; otherwise the device's interval applies"
          >
            <Input
              {...describedBy(id("validUntil"), errors.validUntil, "From the certificate; otherwise the device's interval applies")}
              type="date"
              value={values.validUntil}
              onChange={set("validUntil")}
              className={cn(errors.validUntil && ERROR_BORDER)}
            />
          </Field>
        )}
      </div>

      <Field field={id("notes")} label={failed ? "What was out of tolerance" : "Notes"} required={failed} error={errors.notes}>
        <Textarea
          {...describedBy(id("notes"), errors.notes)}
          value={values.notes}
          onChange={set("notes")}
          rows={2}
          maxLength={2000}
          placeholder={failed ? "Reads 8 mmHg high at 200 mmHg" : undefined}
          className={cn(errors.notes && ERROR_BORDER)}
        />
      </Field>
      {failed && (
        <p role="status" className="rounded-lg bg-critical-500/10 p-3 text-sm text-critical-500">
          The device will be taken out of use. Anyone who scans it will see <strong>Do not use</strong> until a passing
          calibration is recorded.
        </p>
      )}
    </div>
  );
}
