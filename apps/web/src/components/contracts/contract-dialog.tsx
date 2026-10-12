"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { ERROR_BORDER, Field, SELECT_CLASS, describedBy, errorId } from "@/components/forms/form-field";
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
import {
  CONTRACT_TYPE_LABEL,
  type Contract,
  type ContractInput,
  type ContractType,
  type Vendor,
} from "@/lib/api/contracts";
import { useSaveContract, useVendors } from "@/lib/hooks/use-contracts";
import { cn, formatCurrency } from "@/lib/utils";

import { DevicePicker, type PickedDevice } from "./device-picker";
import { VendorDialog } from "./vendor-dialog";

export interface ContractFormValues {
  vendorId: string;
  contractType: ContractType;
  contractNumber: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD, the last day of cover. */
  endDate: string;
  annualValue: string;
  pmVisitsPerYear: string;
  responseTimeHours: string;
  uptimeGuaranteePercent: string;
  devices: PickedDevice[];
  notes: string;
}

type Mode = "create" | "edit" | "renew";
type Errors = Partial<Record<keyof ContractFormValues, string>>;

const pad = (n: number) => String(n).padStart(2, "0");
/** A date as YYYY-MM-DD in local time. */
export const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDay = (day: string) => new Date(`${day}T12:00:00`);
/** Midday local time, so the day is the same wherever the server runs. */
const dayToIso = (day: string) => fromDay(day).toISOString();
const shift = (day: string, { days = 0, years = 0 }) => {
  const d = fromDay(day);
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() + days);
  return toDay(d);
};
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromDay(s).getTime());
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/** The form for a new contract, an edit, or the next period of `contract`. */
export function initialValues(
  mode: Mode,
  contract?: Contract | null,
  devices: PickedDevice[] = [],
): ContractFormValues {
  if (!contract) {
    const start = toDay(new Date());
    return {
      vendorId: "",
      contractType: "CMC",
      contractNumber: "",
      startDate: start,
      endDate: shift(start, { years: 1, days: -1 }),
      annualValue: "",
      pmVisitsPerYear: "",
      responseTimeHours: "",
      uptimeGuaranteePercent: "",
      devices,
      notes: "",
    };
  }
  const same = {
    vendorId: contract.vendor.id,
    contractType: contract.contractType,
    annualValue: str(contract.annualValue),
    pmVisitsPerYear: str(contract.pmVisitsPerYear),
    responseTimeHours: str(contract.responseTimeHours),
    uptimeGuaranteePercent: str(contract.uptimeGuaranteePercent),
    devices: contract.devices.map(({ id, assetTagNumber, equipmentName }) => ({
      id,
      assetTagNumber,
      equipmentName,
    })),
  };
  if (mode === "renew") {
    // The day after it ends, for a year.
    const start = shift(toDay(new Date(contract.endDate)), { days: 1 });
    return {
      ...same,
      contractNumber: "",
      startDate: start,
      endDate: shift(start, { years: 1, days: -1 }),
      notes: "",
    };
  }
  return {
    ...same,
    contractNumber: contract.contractNumber,
    startDate: toDay(new Date(contract.startDate)),
    endDate: toDay(new Date(contract.endDate)),
    notes: contract.notes ?? "",
  };
}

const number = (s: string) => (s.trim() === "" ? undefined : Number(s.trim().replace(/,/g, "")));

export function contractErrors(v: ContractFormValues): Errors {
  const errors: Errors = {};
  if (!v.vendorId) errors.vendorId = "Choose the vendor";
  if (!v.contractNumber.trim()) errors.contractNumber = "Enter the contract or PO number";
  if (!isDay(v.startDate)) errors.startDate = "Enter the start date";
  if (!isDay(v.endDate)) errors.endDate = "Enter the end date";
  else if (isDay(v.startDate) && v.endDate < v.startDate) errors.endDate = "Must be on or after the start date";
  const check = (k: keyof ContractFormValues, ok: (n: number) => boolean, message: string) => {
    const n = number(v[k] as string);
    if (n !== undefined && (!Number.isFinite(n) || !ok(n))) errors[k] = message;
  };
  check("annualValue", (n) => n >= 0, "Enter an amount in rupees");
  check("pmVisitsPerYear", (n) => Number.isInteger(n) && n >= 0 && n <= 52, "Whole number, 0 to 52");
  check("responseTimeHours", (n) => Number.isInteger(n) && n >= 1 && n <= 720, "Whole number of hours, 1 to 720");
  check("uptimeGuaranteePercent", (n) => n >= 0 && n <= 100, "A percentage, 0 to 100");
  if (v.devices.length === 0) errors.devices = "Choose at least one device";
  return errors;
}

export function toContractInput(v: ContractFormValues): ContractInput {
  return {
    vendorId: v.vendorId,
    contractType: v.contractType,
    contractNumber: v.contractNumber.trim(),
    startDate: dayToIso(v.startDate),
    endDate: dayToIso(v.endDate),
    annualValue: number(v.annualValue),
    pmVisitsPerYear: number(v.pmVisitsPerYear),
    responseTimeHours: number(v.responseTimeHours),
    uptimeGuaranteePercent: number(v.uptimeGuaranteePercent),
    deviceIds: v.devices.map((d) => d.id),
    notes: v.notes.trim() || undefined,
  };
}

const TITLE: Record<Mode, string> = {
  create: "Add a contract",
  edit: "Edit contract",
  renew: "Renew contract",
};

/** Add, change or renew an AMC/CMC contract. */
export function ContractDialog({
  mode,
  contract,
  devices,
  prefill,
  onClose,
}: {
  mode: Mode;
  contract?: Contract | null;
  /** Devices to start with (a new contract from a device page). */
  devices?: PickedDevice[];
  /** Details to start a new contract with, e.g. typed on the device earlier. */
  prefill?: Partial<ContractFormValues>;
  onClose: () => void;
}) {
  const [values, setValues] = useState(() => ({ ...initialValues(mode, contract, devices), ...prefill }));
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [addingVendor, setAddingVendor] = useState(false);
  const vendors = useVendors();
  const save = useSaveContract();
  const errors = submitted ? contractErrors(values) : {};
  const set =
    (k: keyof ContractFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues({ ...values, [k]: e.target.value });

  const text = (
    k: keyof ContractFormValues,
    label: string,
    opts: {
      required?: boolean;
      type?: string;
      hint?: string;
      placeholder?: string;
      inputMode?: "numeric" | "decimal";
    } = {},
  ) => (
    <Field field={`contract-${k}`} label={label} required={opts.required} error={errors[k]} hint={opts.hint}>
      <Input
        {...describedBy(`contract-${k}`, errors[k], opts.hint)}
        type={opts.type}
        inputMode={opts.inputMode}
        value={values[k] as string}
        onChange={set(k)}
        placeholder={opts.placeholder}
        maxLength={100}
        className={cn(errors[k] && ERROR_BORDER)}
      />
    </Field>
  );

  const value = number(values.annualValue);
  const before = mode === "renew" ? contract?.annualValue : null;
  const change =
    before && value !== undefined && Number.isFinite(value)
      ? Math.round(((value - before) / before) * 1000) / 10
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerErrors([]);
    if (Object.keys(contractErrors(values)).length) return;
    try {
      const saved = await save.mutateAsync({
        mode,
        id: contract?.id,
        body: toContractInput(values),
      });
      toast.success(
        mode === "renew"
          ? `Renewed: ${saved.contractNumber}`
          : mode === "edit"
            ? "Contract updated"
            : `Contract ${saved.contractNumber} added`,
      );
      onClose();
    } catch (err) {
      const message = (err as { details?: { message?: unknown } }).details?.message;
      setServerErrors(
        Array.isArray(message) ? message.map(String) : [(err as Error).message || "Could not save. Please try again."],
      );
    }
  };

  const vendorList: Vendor[] = vendors.data ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TITLE[mode]}</DialogTitle>
          <DialogDescription>
            {mode === "renew" && contract
              ? `The next period of ${contract.contractType} ${contract.contractNumber} with ${contract.vendor.vendorName}. The current contract stays on record.`
              : "One contract can cover several devices. Reminders go out 90, 60, 30 and 7 days before it ends."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field field="contract-vendorId" label="Vendor" required error={errors.vendorId}>
              <select
                {...describedBy("contract-vendorId", errors.vendorId)}
                value={values.vendorId}
                onChange={set("vendorId")}
                className={cn(SELECT_CLASS, errors.vendorId && ERROR_BORDER)}
              >
                <option value="" disabled>
                  {vendors.isPending ? "Loading…" : vendorList.length ? "Choose a vendor" : "No vendors yet: add one"}
                </option>
                {vendorList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vendorName}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              type="button"
              variant="secondary"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setAddingVendor(true)}
            >
              New vendor
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field field="contract-contractType" label="Type" required>
              <select
                {...describedBy("contract-contractType")}
                value={values.contractType}
                onChange={set("contractType")}
                className={SELECT_CLASS}
              >
                {(Object.keys(CONTRACT_TYPE_LABEL) as ContractType[]).map((t) => (
                  <option key={t} value={t}>
                    {CONTRACT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            {text("contractNumber", "Contract or PO number", {
              required: true,
              placeholder: mode === "renew" && contract ? `Last year: ${contract.contractNumber}` : undefined,
            })}
            {text("startDate", "First day of cover", {
              required: true,
              type: "date",
            })}
            {text("endDate", "Last day of cover", {
              required: true,
              type: "date",
            })}
            {text("annualValue", "Cost per year (₹)", {
              inputMode: "decimal",
              hint:
                change !== null
                  ? `${change > 0 ? "+" : ""}${change}% on last year (${formatCurrency(before!)})`
                  : "All covered devices together",
            })}
            {text("responseTimeHours", "Response time (hours)", {
              inputMode: "numeric",
              hint: "How soon the vendor must attend a breakdown",
            })}
            {text("pmVisitsPerYear", "PM visits a year", {
              inputMode: "numeric",
            })}
            {text("uptimeGuaranteePercent", "Guaranteed uptime (%)", {
              inputMode: "decimal",
            })}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contract-devices">
              Devices covered
              <span aria-hidden="true" className="text-critical-500">
                {" "}
                *
              </span>
            </Label>
            <DevicePicker
              id="contract-devices"
              value={values.devices}
              onChange={(devices) => setValues({ ...values, devices })}
              invalid={Boolean(errors.devices)}
              describedBy={errors.devices ? errorId("contract-devices") : undefined}
            />
            {errors.devices && (
              <p id={errorId("contract-devices")} role="alert" className="text-sm text-critical-500">
                {errors.devices}
              </p>
            )}
          </div>
          <Field field="contract-notes" label="Notes" hint="What is covered or excluded, penalty terms">
            <Textarea
              {...describedBy("contract-notes", undefined, "What is covered or excluded, penalty terms")}
              value={values.notes}
              onChange={set("notes")}
              rows={2}
              maxLength={2000}
            />
          </Field>
          {serverErrors.length > 0 && (
            <div role="alert" className="rounded-lg bg-critical-500/10 p-3 text-sm text-critical-500">
              {serverErrors.length === 1 ? (
                <p>{serverErrors[0]}</p>
              ) : (
                <ul className="list-disc pl-5">
                  {serverErrors.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
              Back
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending
                ? "Saving…"
                : mode === "renew"
                  ? "Renew"
                  : mode === "edit"
                    ? "Save changes"
                    : "Add contract"}
            </Button>
          </DialogFooter>
        </form>
        {/* Inside this dialog, so it stacks on top of it. */}
        {addingVendor && (
          <VendorDialog
            vendor={null}
            onClose={() => setAddingVendor(false)}
            onSaved={(v) => setValues((prev) => ({ ...prev, vendorId: v.id }))}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
