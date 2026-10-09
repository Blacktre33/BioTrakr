"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { Asset, UpdateAssetPayload } from "@/lib/api/assets";
import type { AssetFormReference, FormOption } from "@/lib/api/reference";
import { useUpdateAssetMutation } from "@/lib/hooks/use-assets";
import { cn } from "@/lib/utils";

/** The editable fields, as the strings the inputs hold. */
interface EditValues {
  equipmentName: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  deviceCategory: string;
  criticalityLevel: string;
  riskClassification: string;
  currentFacilityId: string;
  custodianDepartmentId: string;
  primaryCustodianId: string;
  pmFrequencyDays: string;
  usefulLifeYears: string;
  warrantyEndDate: string;
  udiDeviceIdentifier: string;
  notes: string;
}
type EditField = keyof EditValues;

const REQUIRED: EditField[] = [
  "equipmentName",
  "manufacturer",
  "modelNumber",
  "deviceCategory",
  "criticalityLevel",
  "riskClassification",
  "currentFacilityId",
  "custodianDepartmentId",
  "primaryCustodianId",
  "usefulLifeYears",
];

export function valuesFromAsset(asset: Asset): EditValues {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    equipmentName: str(asset.equipmentName),
    manufacturer: str(asset.manufacturer),
    modelNumber: str(asset.modelNumber),
    serialNumber: str(asset.serialNumber),
    deviceCategory: str(asset.deviceCategory),
    criticalityLevel: str(asset.criticalityLevel),
    riskClassification: str(asset.riskClassification),
    currentFacilityId: str(asset.currentFacilityId),
    custodianDepartmentId: str(asset.custodianDepartmentId),
    primaryCustodianId: str(asset.primaryCustodianId),
    pmFrequencyDays: str(asset.pmFrequencyDays),
    usefulLifeYears: str(asset.usefulLifeYears),
    warrantyEndDate: asset.warrantyEndDate ? asset.warrantyEndDate.slice(0, 10) : "",
    udiDeviceIdentifier: str(asset.udiDeviceIdentifier),
    notes: str(asset.notes),
  };
}

export function validateEdit(values: EditValues, departments: AssetFormReference["departments"]): Partial<Record<EditField, string>> {
  const errors: Partial<Record<EditField, string>> = {};
  for (const f of REQUIRED) if (!values[f].trim()) errors[f] = "Required";
  const whole = (raw: string, min: number, max: number) => {
    const n = Number(raw);
    return Number.isInteger(n) && n >= min && n <= max;
  };
  if (values.pmFrequencyDays && !whole(values.pmFrequencyDays, 1, 3650)) {
    errors.pmFrequencyDays = "Whole number of days, 1 to 3650";
  }
  if (!errors.usefulLifeYears && !whole(values.usefulLifeYears, 1, 50)) {
    errors.usefulLifeYears = "Whole number of years, 1 to 50";
  }
  const dept = departments.find((d) => d.id === values.custodianDepartmentId);
  if (dept && values.currentFacilityId && dept.facilityId !== values.currentFacilityId) {
    errors.custodianDepartmentId = "Pick a department in the selected facility";
  }
  return errors;
}

/** Only what changed, converted to the API's types. */
export function changedPayload(before: EditValues, after: EditValues): UpdateAssetPayload {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after) as EditField[]) {
    if (after[key].trim() === before[key].trim()) continue;
    const v = after[key].trim();
    if (key === "pmFrequencyDays" || key === "usefulLifeYears") {
      if (v !== "") out[key] = Number(v);
    } else if (v !== "" || key === "notes" || key === "serialNumber" || key === "udiDeviceIdentifier") {
      out[key] = v;
    }
  }
  return out as UpdateAssetPayload;
}

interface EditAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset;
  reference: AssetFormReference;
}

export function EditAssetDialog({ open, onOpenChange, asset, reference }: EditAssetDialogProps) {
  const initial = useMemo(() => valuesFromAsset(asset), [asset]);
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [serverFields, setServerFields] = useState<Partial<Record<EditField, string>>>({});
  const mutation = useUpdateAssetMutation();

  useEffect(() => {
    if (open) {
      setValues(initial);
      setSubmitted(false);
      setServerError(undefined);
      setServerFields({});
    }
  }, [open, initial]);

  const errors = validateEdit(values, reference.departments);
  const errorFor = (f: EditField) => serverFields[f] ?? (submitted ? errors[f] : undefined);
  const departments = reference.departments.filter((d) => d.facilityId === values.currentFacilityId);

  const set = (f: EditField, v: string) => {
    setValues((prev) => ({
      ...prev,
      [f]: v,
      // A department belongs to one facility.
      ...(f === "currentFacilityId" && v !== prev.currentFacilityId ? { custodianDepartmentId: "" } : {}),
    }));
    setServerFields(({ [f]: _gone, ...rest }) => rest);
  };

  const control = (f: EditField, hint?: string) => ({
    ...describedBy(f, errorFor(f), hint),
    value: values[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(f, e.target.value),
  });

  const enumSelect = (f: EditField, options: FormOption[]) => (
    <select {...control(f)} className={cn(SELECT_CLASS, errorFor(f) && ERROR_BORDER)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.hint ? `${o.label} — ${o.hint}` : o.label}
        </option>
      ))}
    </select>
  );

  const text = (f: EditField, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field field={f} label={label} required={REQUIRED.includes(f)} error={errorFor(f)} hint={hint}>
      <Input {...control(f, hint)} className={cn(errorFor(f) && ERROR_BORDER)} {...extra} />
    </Field>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    const first = (Object.keys(errors) as EditField[])[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    const payload = changedPayload(initial, values);
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      await mutation.mutateAsync({ assetId: asset.id, payload });
      toast.success("Changes saved");
      onOpenChange(false);
    } catch (error) {
      const details = (error as { details?: { fields?: string[] } }).details;
      const fields = Object.fromEntries(
        (details?.fields ?? []).filter((f) => f in initial).map((f) => [f, "Please pick again"]),
      );
      setServerFields(fields);
      setServerError((error as Error).message || "Could not save. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>
            Tag {asset.assetTagNumber}. Status is changed separately, with a reason, from the device page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text("equipmentName", "Equipment name")}
            {text("manufacturer", "Manufacturer")}
            {text("modelNumber", "Model")}
            {text("serialNumber", "Serial number")}
            <Field field="deviceCategory" label="Category" required error={errorFor("deviceCategory")}>
              {enumSelect("deviceCategory", reference.enums.deviceCategory)}
            </Field>
            <Field field="criticalityLevel" label="Criticality" required error={errorFor("criticalityLevel")}>
              {enumSelect("criticalityLevel", reference.enums.criticalityLevel)}
            </Field>
            <Field field="riskClassification" label="Risk class" required error={errorFor("riskClassification")}>
              {enumSelect("riskClassification", reference.enums.riskClassification)}
            </Field>
            <Field field="currentFacilityId" label="Facility" required error={errorFor("currentFacilityId")}>
              <select {...control("currentFacilityId")} className={cn(SELECT_CLASS, errorFor("currentFacilityId") && ERROR_BORDER)}>
                {reference.facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field field="custodianDepartmentId" label="Department" required error={errorFor("custodianDepartmentId")}>
              <select
                {...control("custodianDepartmentId")}
                className={cn(SELECT_CLASS, errorFor("custodianDepartmentId") && ERROR_BORDER)}
              >
                <option value="" disabled>
                  {departments.length ? "Choose a department" : "No departments in this facility"}
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field field="primaryCustodianId" label="Custodian" required error={errorFor("primaryCustodianId")}>
              <select {...control("primaryCustodianId")} className={cn(SELECT_CLASS, errorFor("primaryCustodianId") && ERROR_BORDER)}>
                {reference.custodians.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.jobTitle ? `${c.name} — ${c.jobTitle}` : c.name}
                  </option>
                ))}
              </select>
            </Field>
            {text(
              "pmFrequencyDays",
              "PM every (days)",
              { type: "number", min: 1, max: 3650, step: 1, inputMode: "numeric" },
              "Sets the next PM date after each completed PM. Blank uses 90 days.",
            )}
            {text("usefulLifeYears", "Useful life (years)", { type: "number", min: 1, max: 50, step: 1, inputMode: "numeric" })}
            {text("warrantyEndDate", "Warranty ends", { type: "date" })}
            {text("udiDeviceIdentifier", "UDI")}
          </div>
          <Field field="notes" label="Notes" error={errorFor("notes")}>
            <Textarea {...control("notes")} rows={3} maxLength={5000} />
          </Field>

          {serverError && (
            <p role="alert" className="text-sm text-critical-500">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
