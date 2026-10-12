"use client";

import { Field, SELECT_CLASS, describedBy } from "@/components/forms/form-field";
import { Button, Input } from "@/components/ui";
import type { Checklist, ChecklistAnswer, ItemResult, PmChecklistInput } from "@/lib/api/checklists";
import { checklistErrors, itemResult, outcomeOf, rangeText } from "@/lib/checklists";
import { cn } from "@/lib/utils";

export interface ChecklistValues {
  checklistKey: string;
  testEquipment: string;
  answers: Record<string, ChecklistAnswer>;
}

export const emptyChecklist = (checklistKey: string): ChecklistValues => ({
  checklistKey,
  testEquipment: "",
  answers: {},
});

const CHOICES: Array<{ value: ItemResult; label: string; tone: string }> = [
  { value: "PASS", label: "Pass", tone: "peer-checked:bg-success-500/20 peer-checked:text-success-500" },
  { value: "FLAG", label: "Flag", tone: "peer-checked:bg-warning-500/20 peer-checked:text-warning-500" },
  { value: "FAIL", label: "Fail", tone: "peer-checked:bg-critical-500/20 peer-checked:text-critical-500" },
  { value: "NA", label: "N/A", tone: "peer-checked:bg-white/10 peer-checked:text-gray-100" },
];

const RESULT_TEXT: Record<ItemResult, string> = { PASS: "Pass", FLAG: "Flagged", FAIL: "Fail", NA: "Not applicable" };

export function checklistInvalid(checklist: Checklist | undefined, values: ChecklistValues): boolean {
  return !checklist || Object.keys(checklistErrors(checklist.items, values.answers)).length > 0;
}

export function checklistOutcome(checklist: Checklist | undefined, values: ChecklistValues) {
  return checklist ? outcomeOf(checklist.items.map((i) => itemResult(i, values.answers[i.key]))) : "PASS";
}

export function toChecklistInput(values: ChecklistValues, checklist: Checklist): PmChecklistInput {
  return {
    checklistKey: values.checklistKey,
    ...(values.testEquipment.trim() ? { testEquipment: values.testEquipment.trim() } : {}),
    items: checklist.items.map((i) => {
      const a = values.answers[i.key] ?? { key: i.key };
      return {
        key: i.key,
        ...(a.result ? { result: a.result } : {}),
        ...(typeof a.reading === "number" ? { reading: a.reading } : {}),
        ...(a.note?.trim() ? { note: a.note.trim() } : {}),
      };
    }),
  };
}

/**
 * A preventive maintenance checklist, item by item: pass, flag (needs
 * attention, still usable), fail (not safe to use) or not applicable, and
 * the readings, each held to its limits as it is typed.
 */
export function ChecklistFields({
  checklists,
  values,
  onChange,
  showErrors,
  idPrefix = "pm",
}: {
  checklists: Checklist[];
  values: ChecklistValues;
  onChange: (v: ChecklistValues) => void;
  showErrors: boolean;
  idPrefix?: string;
}) {
  const offered = checklists.filter((c) => c.active);
  const checklist = offered.find((c) => c.key === values.checklistKey);
  const errors = checklist && showErrors ? checklistErrors(checklist.items, values.answers) : {};
  const answer = (key: string, patch: Partial<ChecklistAnswer>) =>
    onChange({
      ...values,
      answers: { ...values.answers, [key]: { ...values.answers[key], key, ...patch } },
    });
  const passRemaining = () =>
    onChange({
      ...values,
      answers: Object.fromEntries(
        checklist!.items.map((i) => [
          i.key,
          i.kind === "check" && !values.answers[i.key]?.result
            ? { key: i.key, result: "PASS" as const }
            : (values.answers[i.key] ?? { key: i.key }),
        ]),
      ),
    });
  const outcome = checklistOutcome(checklist, values);
  const flagged = checklist?.items.filter((i) => itemResult(i, values.answers[i.key]) === "FLAG").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field field={`${idPrefix}-checklist`} label="Checklist" required>
          <select
            {...describedBy(`${idPrefix}-checklist`)}
            value={values.checklistKey}
            onChange={(e) => onChange({ ...values, checklistKey: e.target.value, answers: {} })}
            className={SELECT_CLASS}
          >
            {offered.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
                {c.builtIn ? "" : " (ours)"}
              </option>
            ))}
          </select>
        </Field>
        <Field
          field={`${idPrefix}-equipment`}
          label="Test equipment used"
          hint="Analyser or simulator, serial number, and when it was calibrated"
        >
          <Input
            {...describedBy(`${idPrefix}-equipment`, undefined, "hint")}
            value={values.testEquipment}
            maxLength={500}
            onChange={(e) => onChange({ ...values, testEquipment: e.target.value })}
            placeholder="Fluke ProSim 8, SN 41, calibrated Apr 2026"
          />
        </Field>
      </div>

      {checklist && (
        <>
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={passRemaining}>
              Mark the remaining checks as passed
            </Button>
          </div>
          <ol className="space-y-3">
            {checklist.items.map((item, n) => {
              const a = values.answers[item.key];
              const result = itemResult(item, a);
              const limits = rangeText(item);
              const decides = item.kind === "reading" && limits !== null;
              const id = `${idPrefix}-item-${item.key}`;
              const error = errors[item.key];
              return (
                <li key={item.key}>
                  <fieldset
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={cn("rounded-xl border p-3", error ? "border-critical-500/60" : "border-white/10")}
                  >
                    <legend className="px-1 text-sm text-gray-100">
                      {n + 1}. {item.text}
                    </legend>
                    <div className="flex flex-wrap items-center gap-3">
                      {item.kind === "reading" && (
                        <span className="flex items-center gap-2 text-sm text-gray-300">
                          <Input
                            id={id}
                            aria-label={`Reading${item.unit ? ` in ${item.unit}` : ""}`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            className="w-28 py-2"
                            disabled={a?.result === "NA"}
                            value={a?.reading ?? ""}
                            onChange={(e) =>
                              answer(item.key, {
                                reading: e.target.value === "" ? undefined : Number(e.target.value),
                              })
                            }
                          />
                          <span aria-hidden="true">{item.unit}</span>
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {CHOICES.filter((c) => !decides || c.value === "NA" || c.value === "FLAG").map((c) => (
                          <label key={c.value} className="cursor-pointer">
                            <input
                              type={decides ? "checkbox" : "radio"}
                              name={id}
                              className="peer sr-only"
                              checked={a?.result === c.value}
                              onChange={(e) =>
                                answer(item.key, { result: decides && !e.target.checked ? undefined : c.value })
                              }
                            />
                            <span
                              className={cn(
                                "inline-block rounded-lg border border-white/10 px-3 py-1 text-sm text-gray-300 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/60",
                                c.tone,
                              )}
                            >
                              {c.label}
                            </span>
                          </label>
                        ))}
                      </div>
                      {decides && (
                        <span className="text-xs text-gray-400">
                          Limit {limits}
                          {result && result !== "NA" && (
                            <strong
                              className={cn(
                                "ml-2",
                                result === "FAIL"
                                  ? "text-critical-500"
                                  : result === "FLAG"
                                    ? "text-warning-500"
                                    : "text-success-500",
                              )}
                            >
                              {RESULT_TEXT[result]}
                            </strong>
                          )}
                        </span>
                      )}
                    </div>
                    {(result === "FLAG" || result === "FAIL") && (
                      <label className="mt-2 block text-sm text-gray-300">
                        What was found
                        <Input
                          className="mt-1 py-2"
                          maxLength={500}
                          value={a?.note ?? ""}
                          onChange={(e) => answer(item.key, { note: e.target.value })}
                        />
                      </label>
                    )}
                    {error && (
                      <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-critical-500">
                        {error}
                      </p>
                    )}
                  </fieldset>
                </li>
              );
            })}
          </ol>
          {outcome === "FAIL" ? (
            <p role="status" className="rounded-xl bg-critical-500/10 p-3 text-sm text-critical-500">
              This PM fails: the device will be taken out of use and a repair opened for what failed.
            </p>
          ) : flagged > 0 ? (
            <p role="status" className="rounded-xl bg-warning-500/10 p-3 text-sm text-warning-500">
              {flagged} {flagged === 1 ? "item" : "items"} flagged: the device stays in use, and the findings stay on
              record for the next visit.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
