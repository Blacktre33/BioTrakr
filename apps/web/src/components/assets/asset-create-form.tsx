"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useCreateAssetMutation } from "@/lib/hooks/use-assets";
import { useAssetFormReference } from "@/lib/hooks/use-asset-form-reference";
import { getSession } from "@/lib/auth/session";
import type { FormOption } from "@/lib/api/reference";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/utils";

import {
  EMPTY_ASSET_FORM,
  FIELD_ORDER,
  REQUIRED_FIELDS,
  contractIncrease,
  fieldErrorsFromApi,
  toCreateAssetPayload,
  validateAssetForm,
  type AssetField,
  type AssetFormValues,
  type FieldErrors,
} from "./asset-form-validation";

interface AssetCreateFormProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAssetCreated?: () => void;
}

const SELECT_CLASS =
  "w-full px-4 py-3 bg-surface-200/50 border border-white/5 rounded-xl text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-60";
const ERROR_BORDER = "border-critical-500/60 focus:ring-critical-500/50";

const errorId = (field: AssetField) => `${field}-error`;
const hintId = (field: AssetField) => `${field}-hint`;

function Field({
  field,
  label,
  error,
  hint,
  children,
}: {
  field: AssetField;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const required = REQUIRED_FIELDS.includes(field);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-critical-500">
            {" "}*
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={errorId(field)} role="alert" className="text-sm text-critical-500">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId(field)} className="text-xs text-gray-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function AssetCreateForm({ open, onOpenChange, onAssetCreated }: AssetCreateFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createAssetMutation = useCreateAssetMutation();

  const isOpen = open ?? searchParams.get("new") === "true";
  const reference = useAssetFormReference(isOpen);
  const ref = reference.data;

  const [values, setValues] = useState<AssetFormValues>(EMPTY_ASSET_FORM);
  const [touched, setTouched] = useState<Partial<Record<AssetField, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  const clientErrors = useMemo(() => validateAssetForm(values, ref), [values, ref]);
  const errorFor = (field: AssetField) =>
    serverErrors[field] ?? (touched[field] ? clientErrors[field] : undefined);

  const departments = useMemo(
    () => (ref?.departments ?? []).filter((d) => d.facilityId === values.currentFacilityId),
    [ref, values.currentFacilityId],
  );
  const custodians = useMemo(() => {
    const all = ref?.custodians ?? [];
    // People in the chosen department first, then everyone else in the organization.
    const inDept = all.filter((c) => values.custodianDepartmentId && c.departmentId === values.custodianDepartmentId);
    return inDept.length > 0 ? [...inDept, ...all.filter((c) => !inDept.includes(c))] : all;
  }, [ref, values.custodianDepartmentId]);

  // Pre-fill choices that have only one sensible answer, to save taps.
  useEffect(() => {
    if (!ref) return;
    setValues((prev) => {
      const prefill: Partial<AssetFormValues> = {};
      if (!prev.currentFacilityId && ref.facilities.length === 1) {
        prefill.currentFacilityId = ref.facilities[0].id;
      }
      if (!prev.primaryCustodianId) {
        const me = getSession()?.user.id;
        if (me && ref.custodians.some((c) => c.id === me)) prefill.primaryCustodianId = me;
      }
      // Same object when nothing changes, so this never re-renders in a loop.
      return Object.keys(prefill).length > 0 ? { ...prev, ...prefill } : prev;
    });
    // Re-run after a reset, so the next device starts pre-filled too.
  }, [ref, values.currentFacilityId, values.primaryCustodianId]);

  useEffect(() => {
    if (!values.custodianDepartmentId && departments.length === 1) {
      setValues((prev) => ({ ...prev, custodianDepartmentId: departments[0].id }));
    }
  }, [departments, values.custodianDepartmentId]);

  const setField = (field: AssetField, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [field]: value };
      // A department belongs to one facility; clear it when the facility changes.
      if (field === "currentFacilityId" && prev.currentFacilityId !== value) {
        next.custodianDepartmentId = "";
      }
      return next;
    });
    if (serverErrors[field]) {
      setServerErrors(({ [field]: _cleared, ...rest }) => rest);
    }
  };

  /** Props shared by every input/select: value, change, blur-to-validate and ARIA wiring. */
  const control = (field: AssetField) => {
    const error = errorFor(field);
    return {
      id: field,
      name: field,
      value: values[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setField(field, e.target.value),
      onBlur: () => setTouched((prev) => ({ ...prev, [field]: true })),
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? errorId(field) : hintId(field),
      "aria-required": REQUIRED_FIELDS.includes(field) || undefined,
    };
  };

  const optionHint = (options: FormOption[] | undefined, value: string) =>
    options?.find((o) => o.value === value)?.hint;

  const enumSelect = (field: AssetField, options: FormOption[] | undefined, placeholder?: string) => (
    <select
      {...control(field)}
      className={cn(SELECT_CLASS, errorFor(field) && ERROR_BORDER)}
      disabled={!options}
    >
      {!options && <option value="">Loading…</option>}
      {options && placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.hint ? `${o.label} — ${o.hint}` : o.label}
        </option>
      ))}
    </select>
  );

  const reset = () => {
    setValues(EMPTY_ASSET_FORM);
    setTouched({});
    setServerErrors({});
    setFormError(undefined);
  };

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("new");
        router.replace(`/assets?${params.toString()}`);
      }
      onOpenChange?.(nextOpen);
    },
    [searchParams, router, onOpenChange],
  );

  const focusFirst = (errors: FieldErrors) => {
    const first = FIELD_ORDER.find((f) => errors[f]);
    if (!first) return;
    const el = document.getElementById(first);
    // Contract fields live in a collapsible section; open it first.
    el?.closest("details")?.setAttribute("open", "");
    el?.focus();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);

    if (Object.keys(clientErrors).length > 0) {
      setTouched(Object.fromEntries(FIELD_ORDER.map((f) => [f, true])));
      focusFirst(clientErrors);
      return;
    }

    try {
      await createAssetMutation.mutateAsync(toCreateAssetPayload(values));
      toast.success(`${values.equipmentName.trim()} added`);
      reset();
      handleClose(false);
      onAssetCreated?.();
    } catch (error) {
      const { fields, formError: message } = fieldErrorsFromApi(error);
      setServerErrors(fields);
      setFormError(message);
      focusFirst(fields);
    }
  };

  const amcIncrease = contractIncrease(values.amcInitialCost, values.amcCostAnnual);
  const cmcIncrease = contractIncrease(values.cmcInitialCost, values.cmcCostAnnual);
  const errorCount = Object.keys(touched).length > 0 ? Object.keys(clientErrors).filter((f) => touched[f as AssetField]).length : 0;

  const textInput = (field: AssetField, placeholder: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input
      {...control(field)}
      placeholder={placeholder}
      className={cn(errorFor(field) && ERROR_BORDER)}
      {...extra}
    />
  );

  const contractSection = (prefix: "amc" | "cmc", title: string, increase: ReturnType<typeof contractIncrease>) => (
    <div className="space-y-4 p-4 bg-surface-200/20 rounded-xl">
      <h4 className="font-medium text-white">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field field={`${prefix}ContractNumber`} label="Contract number" error={errorFor(`${prefix}ContractNumber`)}>
          {textInput(`${prefix}ContractNumber`, `e.g. ${prefix.toUpperCase()}-2024-001`)}
        </Field>
        <Field field={`${prefix}YearsPaid`} label="Years paid" error={errorFor(`${prefix}YearsPaid`)}>
          {textInput(`${prefix}YearsPaid`, "0", { type: "number", min: 0, step: 1, inputMode: "numeric" })}
        </Field>
        <Field field={`${prefix}InitialCost`} label="First-year cost (₹)" error={errorFor(`${prefix}InitialCost`)}>
          {textInput(`${prefix}InitialCost`, "0.00", { type: "number", min: 0, step: "0.01", inputMode: "decimal" })}
        </Field>
        <Field field={`${prefix}CostAnnual`} label="Current annual cost (₹)" error={errorFor(`${prefix}CostAnnual`)}>
          {textInput(`${prefix}CostAnnual`, "0.00", { type: "number", min: 0, step: "0.01", inputMode: "decimal" })}
        </Field>
        <Field field={`${prefix}StartDate`} label="Start date" error={errorFor(`${prefix}StartDate`)}>
          {textInput(`${prefix}StartDate`, "", { type: "date" })}
        </Field>
        <Field field={`${prefix}EndDate`} label="End date" error={errorFor(`${prefix}EndDate`)}>
          {textInput(`${prefix}EndDate`, "", { type: "date", min: values[`${prefix}StartDate`] || undefined })}
        </Field>
      </div>
      {increase && (
        <p className="text-sm text-gray-300 p-3 bg-primary-500/10 rounded-lg border border-primary-500/20">
          Cost has gone up ₹{increase.amount.toLocaleString("en-IN")} ({increase.percentage}%) since the first year.
        </p>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a device</DialogTitle>
          <DialogDescription>
            Fields marked <span className="text-critical-500">*</span> are required. Service contracts are optional.
          </DialogDescription>
        </DialogHeader>

        {reference.isError && (
          <div role="alert" className="p-3 rounded-lg border border-critical-500/40 bg-critical-500/10 text-sm text-gray-200">
            Couldn&apos;t load the dropdown choices.{" "}
            <button type="button" className="underline" onClick={() => reference.refetch()}>
              Try again
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <section className="space-y-4" aria-labelledby="device-heading">
            <h3 id="device-heading" className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Device
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field field="assetTagNumber" label="Asset tag" error={errorFor("assetTagNumber")} hint="As printed on the tag or barcode label">
                {textInput("assetTagNumber", "e.g. BME-2024-001", { autoComplete: "off", autoCapitalize: "characters" })}
              </Field>
              <Field field="equipmentName" label="Equipment name" error={errorFor("equipmentName")}>
                {textInput("equipmentName", "e.g. ICU ventilator")}
              </Field>
              <Field field="manufacturer" label="Manufacturer" error={errorFor("manufacturer")}>
                {textInput("manufacturer", "e.g. GE Healthcare")}
              </Field>
              <Field field="modelNumber" label="Model" error={errorFor("modelNumber")}>
                {textInput("modelNumber", "e.g. Optima MR360")}
              </Field>
              <Field field="serialNumber" label="Serial number" error={errorFor("serialNumber")} hint="On the manufacturer's plate">
                {textInput("serialNumber", "e.g. SN123456", { autoComplete: "off" })}
              </Field>
              <Field field="deviceCategory" label="Category" error={errorFor("deviceCategory")}>
                {enumSelect("deviceCategory", ref?.enums.deviceCategory, "Choose a category")}
              </Field>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="risk-heading">
            <h3 id="risk-heading" className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Status and risk
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field
                field="assetStatus"
                label="Status"
                error={errorFor("assetStatus")}
                hint={optionHint(ref?.enums.assetStatus, values.assetStatus)}
              >
                {enumSelect("assetStatus", ref?.enums.assetStatus)}
              </Field>
              <Field field="criticalityLevel" label="Criticality" error={errorFor("criticalityLevel")}>
                {enumSelect("criticalityLevel", ref?.enums.criticalityLevel, "Choose")}
              </Field>
              <Field
                field="riskClassification"
                label="Risk class"
                error={errorFor("riskClassification")}
                hint={optionHint(ref?.enums.riskClassification, values.riskClassification)}
              >
                {enumSelect("riskClassification", ref?.enums.riskClassification, "Choose")}
              </Field>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="where-heading">
            <h3 id="where-heading" className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Where it is and who looks after it
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field field="currentFacilityId" label="Facility" error={errorFor("currentFacilityId")}>
                <select {...control("currentFacilityId")} className={cn(SELECT_CLASS, errorFor("currentFacilityId") && ERROR_BORDER)} disabled={!ref}>
                  <option value="" disabled>
                    {ref ? (ref.facilities.length ? "Choose a facility" : "No facilities set up yet") : "Loading…"}
                  </option>
                  {ref?.facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code})
                    </option>
                  ))}
                </select>
              </Field>
              <Field field="custodianDepartmentId" label="Department" error={errorFor("custodianDepartmentId")}>
                <select
                  {...control("custodianDepartmentId")}
                  className={cn(SELECT_CLASS, errorFor("custodianDepartmentId") && ERROR_BORDER)}
                  disabled={!ref || !values.currentFacilityId}
                >
                  <option value="" disabled>
                    {!values.currentFacilityId ? "Choose a facility first" : departments.length ? "Choose a department" : "No departments in this facility"}
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field field="primaryCustodianId" label="Custodian" error={errorFor("primaryCustodianId")} hint="The person responsible for this device">
                <select {...control("primaryCustodianId")} className={cn(SELECT_CLASS, errorFor("primaryCustodianId") && ERROR_BORDER)} disabled={!ref}>
                  <option value="" disabled>
                    {ref ? "Choose a person" : "Loading…"}
                  </option>
                  {custodians.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.jobTitle ? `${c.name} — ${c.jobTitle}` : c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="purchase-heading">
            <h3 id="purchase-heading" className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Purchase
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field field="purchaseDate" label="Purchase date" error={errorFor("purchaseDate")}>
                {textInput("purchaseDate", "", { type: "date", max: new Date().toISOString().slice(0, 10) })}
              </Field>
              <Field field="purchaseCost" label="Purchase cost (₹)" error={errorFor("purchaseCost")} hint="Enter 0 if donated">
                {textInput("purchaseCost", "0.00", { type: "number", min: 0, step: "0.01", inputMode: "decimal" })}
              </Field>
              <Field field="usefulLifeYears" label="Useful life (years)" error={errorFor("usefulLifeYears")}>
                {textInput("usefulLifeYears", "10", { type: "number", min: 1, max: 50, step: 1, inputMode: "numeric" })}
              </Field>
            </div>
          </section>

          <details className="border-t border-white/10 pt-4 group">
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-gray-400">
              Service contracts (AMC / CMC) — optional
            </summary>
            <div className="space-y-4 pt-4">
              {contractSection("amc", "Annual Maintenance Contract (AMC)", amcIncrease)}
              {contractSection("cmc", "Comprehensive Maintenance Contract (CMC)", cmcIncrease)}
            </div>
          </details>

          <Field field="notes" label="Notes" error={errorFor("notes")}>
            <Textarea {...control("notes")} placeholder="Anything the next person should know" rows={3} />
          </Field>

          {formError && (
            <p role="alert" className="text-sm text-critical-500">
              {formError}
            </p>
          )}

          <DialogFooter className="pt-2 items-center gap-3">
            {errorCount > 0 && (
              <p className="text-sm text-critical-500 mr-auto" aria-live="polite">
                {errorCount === 1 ? "1 field needs attention" : `${errorCount} fields need attention`}
              </p>
            )}
            <Button type="button" variant="ghost" onClick={() => handleClose(false)} disabled={createAssetMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createAssetMutation.isPending || !ref}>
              {createAssetMutation.isPending ? "Saving…" : "Add device"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
