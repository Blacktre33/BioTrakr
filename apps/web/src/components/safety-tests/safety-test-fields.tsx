"use client";

import { ERROR_BORDER, Field, SELECT_CLASS, describedBy, errorId, hintId } from "@/components/forms/form-field";
import { Input, Label, Textarea } from "@/components/ui";
import { today } from "@/components/calibration/calibration-fields";
import { PROVIDER_LABEL, type ServiceProvider } from "@/lib/api/calibration";
import {
  APPLIED_PART_LABEL,
  CLASS_LABEL,
  METHOD_LABEL,
  REASON_LABEL,
  safetyTestProblems,
  type SafetyTestInput,
  type SafetyTestReason,
} from "@/lib/api/safety-tests";
import {
  evaluateSafetyTest,
  type AppliedPartType,
  type CheckKey,
  type ElectricalClass,
  type LeakageMethod,
  type SafetyCheck,
} from "@/lib/iec62353";
import { cn } from "@/lib/utils";

type ReadingKey =
  | "earthResistanceOhm"
  | "insulationMainsMOhm"
  | "insulationAppliedMOhm"
  | "equipmentLeakageUa"
  | "appliedPartLeakageUa";

/** Which form field holds each check's reading. */
const READING_OF: Partial<Record<CheckKey, ReadingKey>> = {
  earthResistance: "earthResistanceOhm",
  insulationMains: "insulationMainsMOhm",
  insulationApplied: "insulationAppliedMOhm",
  equipmentLeakage: "equipmentLeakageUa",
  appliedPartLeakage: "appliedPartLeakageUa",
};

/** What the form holds; readings as typed, the date as YYYY-MM-DD. */
export interface SafetyTestFormValues {
  testedAt: string;
  reason: SafetyTestReason;
  provider: ServiceProvider;
  providerName: string;
  analyzer: string;
  electricalClass: ElectricalClass;
  appliedPartType: AppliedPartType;
  leakageMethod: LeakageMethod;
  medicalSystem: boolean;
  mobileXray: boolean;
  defibrillationPaddles: boolean;
  /** "" until someone says. */
  visualInspection: "" | "pass" | "fail";
  functionalTest: "" | "pass" | "fail";
  earthResistanceOhm: string;
  insulationMainsMOhm: string;
  insulationAppliedMOhm: string;
  equipmentLeakageUa: string;
  appliedPartLeakageUa: string;
  notes: string;
}

/** A blank test, with the device's class and applied parts when known. */
export const emptySafetyTest = (device?: {
  electricalClass?: ElectricalClass | null;
  appliedPartType?: AppliedPartType | null;
}): SafetyTestFormValues => ({
  testedAt: today(),
  reason: "ROUTINE",
  provider: "IN_HOUSE",
  providerName: "",
  analyzer: "",
  electricalClass: device?.electricalClass ?? "CLASS_I",
  appliedPartType: device?.appliedPartType ?? "BF",
  leakageMethod: "DIRECT",
  medicalSystem: false,
  mobileXray: false,
  defibrillationPaddles: false,
  visualInspection: "",
  functionalTest: "",
  earthResistanceOhm: "",
  insulationMainsMOhm: "",
  insulationAppliedMOhm: "",
  equipmentLeakageUa: "",
  appliedPartLeakageUa: "",
  notes: "",
});

const dayToIso = (day: string) => (day ? new Date(`${day}T12:00:00`).toISOString() : "");
const number = (s: string) => (s.trim() === "" ? undefined : Number(s.trim().replace(",", ".")));

/** Only the readings that apply to this class and these applied parts are sent. */
export function toSafetyTestInput(v: SafetyTestFormValues): SafetyTestInput {
  const classI = v.electricalClass === "CLASS_I";
  const mains = v.electricalClass !== "INTERNALLY_POWERED";
  const opt = (s: string) => s.trim() || undefined;
  const base: SafetyTestInput = {
    testedAt: dayToIso(v.testedAt),
    reason: v.reason,
    provider: v.provider,
    providerName: v.provider === "IN_HOUSE" ? undefined : opt(v.providerName),
    analyzer: v.analyzer.trim(),
    electricalClass: v.electricalClass,
    appliedPartType: v.appliedPartType,
    leakageMethod: v.leakageMethod,
    medicalSystem: classI && v.medicalSystem,
    mobileXray: mains && v.mobileXray,
    defibrillationPaddles: v.appliedPartType === "CF" && v.defibrillationPaddles,
    visualInspectionPassed: v.visualInspection === "pass",
    functionalTestPassed: v.functionalTest === "pass",
    notes: opt(v.notes),
  };
  for (const check of evaluateSafetyTest(base).checks) {
    const key = READING_OF[check.key];
    if (key) base[key] = number(v[key]);
  }
  return base;
}

const FIELD_OF: Record<string, keyof SafetyTestFormValues> = {
  "Enter the test date": "testedAt",
  "The test date cannot be in the future": "testedAt",
  "Name the laboratory": "providerName",
  "Name the manufacturer or vendor": "providerName",
  "Say which safety analyser was used": "analyzer",
  "Enter the protective earth resistance": "earthResistanceOhm",
  "Enter the equipment leakage current": "equipmentLeakageUa",
  "Enter the applied part leakage current": "appliedPartLeakageUa",
};

export function safetyTestErrors(v: SafetyTestFormValues): Partial<Record<keyof SafetyTestFormValues, string>> {
  const errors: Partial<Record<keyof SafetyTestFormValues, string>> = {};
  const input = toSafetyTestInput(v);
  for (const key of Object.values(READING_OF)) {
    const value = input[key];
    if (value !== undefined && !(Number.isFinite(value) && value >= 0)) errors[key] = "Enter a number, e.g. 0.12";
  }
  if (!v.visualInspection) errors.visualInspection = "Say whether the visual inspection passed";
  if (!v.functionalTest) errors.functionalTest = "Say whether the functional test passed";
  for (const message of safetyTestProblems(input).problems) {
    const field = FIELD_OF[message];
    if (field && !errors[field]) errors[field] = message;
  }
  return errors;
}

/** The result the readings give, as the API will work it out; null until complete. */
export function expectedResult(v: SafetyTestFormValues) {
  // A check nobody has answered yet is not a failure.
  const unanswered = new Set([
    !v.visualInspection && "Visual inspection failed",
    !v.functionalTest && "Functional test failed",
  ]);
  const evaluation = evaluateSafetyTest(toSafetyTestInput(v));
  const failures = evaluation.failures.filter((f) => !unanswered.has(f));
  if (failures.length) return { passed: false, failures };
  if (evaluation.missing.length || !v.visualInspection || !v.functionalTest) return null;
  return { passed: true, failures: [] };
}

const limitText = (c: SafetyCheck) =>
  `${c.rule === "max" ? "At most" : "At least"} ${c.limit} ${c.unit}${c.required ? "" : " (optional)"}`;

function PassFail({
  id,
  legend,
  value,
  onChange,
  error,
}: {
  id: string;
  legend: string;
  value: "" | "pass" | "fail";
  onChange: (v: "pass" | "fail") => void;
  error?: string;
}) {
  return (
    <fieldset className="space-y-1.5" aria-describedby={error ? errorId(id) : undefined}>
      <legend className="text-sm font-medium text-gray-300">
        {legend}
        <span aria-hidden="true" className="text-critical-500">
          {" "}*
        </span>
      </legend>
      <div className="flex gap-4">
        {(["pass", "fail"] as const).map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="radio"
              name={id}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="h-4 w-4 accent-primary-500"
            />
            {option === "pass" ? "Passed" : "Failed"}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId(id)} role="alert" className="text-sm text-critical-500">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * The electrical safety test part of a form (IS/IEC 62353): who tested, with
 * what, the device's class and applied parts, then each reading with its
 * limit and whether it passes.
 */
export function SafetyTestFields({
  values,
  onChange,
  showErrors,
  idPrefix = "est",
}: {
  values: SafetyTestFormValues;
  onChange: (next: SafetyTestFormValues) => void;
  showErrors: boolean;
  idPrefix?: string;
}) {
  const errors = showErrors ? safetyTestErrors(values) : {};
  const id = (k: string) => `${idPrefix}-${k}`;
  const set =
    (k: keyof SafetyTestFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange({ ...values, [k]: e.target.value });
  const toggle = (k: "medicalSystem" | "mobileXray" | "defibrillationPaddles") => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [k]: e.target.checked });
  const select = <T extends string>(k: keyof SafetyTestFormValues, label: string, options: Record<T, string>) => (
    <Field field={id(k)} label={label} required>
      <select {...describedBy(id(k))} value={values[k] as string} onChange={set(k)} className={SELECT_CLASS}>
        {(Object.keys(options) as T[]).map((o) => (
          <option key={o} value={o}>
            {options[o]}
          </option>
        ))}
      </select>
    </Field>
  );
  const checkbox = (k: "medicalSystem" | "mobileXray" | "defibrillationPaddles", label: string) => (
    <label className="flex items-center gap-2 text-sm text-gray-300">
      <input type="checkbox" id={id(k)} checked={values[k]} onChange={toggle(k)} className="h-4 w-4 accent-primary-500" />
      {label}
    </label>
  );

  const input = toSafetyTestInput(values);
  const readings = evaluateSafetyTest(input).checks.filter((c) => READING_OF[c.key]);
  const result = expectedResult(values);
  const classI = values.electricalClass === "CLASS_I";
  const mains = values.electricalClass !== "INTERNALLY_POWERED";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field field={id("testedAt")} label="Date tested" required error={errors.testedAt}>
          <Input
            {...describedBy(id("testedAt"), errors.testedAt)}
            type="date"
            max={today()}
            value={values.testedAt}
            onChange={set("testedAt")}
            className={cn(errors.testedAt && ERROR_BORDER)}
          />
        </Field>
        {select<SafetyTestReason>("reason", "Why tested", REASON_LABEL)}
        {select<ServiceProvider>("provider", "Tested by", PROVIDER_LABEL)}
        {values.provider !== "IN_HOUSE" && (
          <Field
            field={id("providerName")}
            label={values.provider === "EXTERNAL_LAB" ? "Laboratory" : "Manufacturer or vendor"}
            required
            error={errors.providerName}
          >
            <Input
              {...describedBy(id("providerName"), errors.providerName)}
              value={values.providerName}
              onChange={set("providerName")}
              maxLength={200}
              className={cn(errors.providerName && ERROR_BORDER)}
            />
          </Field>
        )}
      </div>
      <Field
        field={id("analyzer")}
        label="Safety analyser used"
        required
        error={errors.analyzer}
        hint="Make, model and serial, and when it was last calibrated"
      >
        <Input
          {...describedBy(id("analyzer"), errors.analyzer, "Make, model and serial, and when it was last calibrated")}
          value={values.analyzer}
          onChange={set("analyzer")}
          maxLength={300}
          placeholder="Rigel 288+, SN 12345, calibrated April 2026"
          className={cn(errors.analyzer && ERROR_BORDER)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        {select<ElectricalClass>("electricalClass", "Protection class", CLASS_LABEL)}
        {select<AppliedPartType>("appliedPartType", "Applied parts", APPLIED_PART_LABEL)}
        {mains && select<LeakageMethod>("leakageMethod", "Leakage method", METHOD_LABEL)}
      </div>
      {(classI || mains || values.appliedPartType === "CF") && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {classI && checkbox("medicalSystem", "Tested as a medical system (several items)")}
          {mains && checkbox("mobileXray", "Mobile X-ray")}
          {values.appliedPartType === "CF" && checkbox("defibrillationPaddles", "Applied parts are defibrillator paddles")}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <PassFail
          id={id("visualInspection")}
          legend="Visual inspection"
          value={values.visualInspection}
          onChange={(v) => onChange({ ...values, visualInspection: v })}
          error={errors.visualInspection}
        />
        <PassFail
          id={id("functionalTest")}
          legend="Functional test"
          value={values.functionalTest}
          onChange={(v) => onChange({ ...values, functionalTest: v })}
          error={errors.functionalTest}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {readings.map((c) => {
          const key = READING_OF[c.key]!;
          const field = id(key);
          const error = errors[key];
          const hint = limitText(c);
          return (
            <div key={c.key} className="space-y-1.5">
              <Label htmlFor={field}>
                {c.label} ({c.unit})
                {c.required && (
                  <span aria-hidden="true" className="text-critical-500">
                    {" "}*
                  </span>
                )}
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  {...describedBy(field, error, hint)}
                  aria-describedby={[error ? errorId(field) : null, hintId(field)].filter(Boolean).join(" ")}
                  inputMode="decimal"
                  value={values[key]}
                  onChange={set(key)}
                  className={cn("max-w-[10rem]", error && ERROR_BORDER)}
                />
                {c.passed !== null && (
                  <span className={cn("text-sm font-medium", c.passed ? "text-success-500" : "text-critical-500")}>
                    {c.passed ? "Pass" : "Fail"}
                  </span>
                )}
              </div>
              <p id={hintId(field)} className="text-xs text-gray-400">
                {hint}
              </p>
              {error && (
                <p id={errorId(field)} role="alert" className="text-sm text-critical-500">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Field field={id("notes")} label="Notes" hint="Anything found or repaired">
        <Textarea
          {...describedBy(id("notes"), undefined, "Anything found or repaired")}
          value={values.notes}
          onChange={set("notes")}
          rows={2}
          maxLength={2000}
        />
      </Field>

      <div aria-live="polite">
        {result?.passed === false && (
          <div role="status" className="space-y-1 rounded-lg bg-critical-500/10 p-3 text-sm text-critical-500">
            <p>
              <strong>Fails IS/IEC 62353.</strong> The device will be taken out of use. Anyone who scans it will see{" "}
              <strong>Do not use</strong> until a passing test is recorded.
            </p>
            <ul className="list-disc pl-5">
              {result.failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {result?.passed === true && (
          <p role="status" className="rounded-lg bg-success-500/10 p-3 text-sm text-success-500">
            Passes IS/IEC 62353.
          </p>
        )}
      </div>
    </div>
  );
}
