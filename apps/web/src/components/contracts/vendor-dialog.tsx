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
import { VENDOR_TYPE_LABEL, type Vendor, type VendorInput, type VendorType } from "@/lib/api/contracts";
import { useSaveVendor } from "@/lib/hooks/use-contracts";
import { cn } from "@/lib/utils";

const PHONE = /^\+?[\d\s()-]{6,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function vendorErrors(v: VendorInput): Partial<Record<keyof VendorInput, string>> {
  const errors: Partial<Record<keyof VendorInput, string>> = {};
  if (v.vendorName.trim().length < 2) errors.vendorName = "Enter the vendor's name";
  if (v.phone?.trim() && !PHONE.test(v.phone.trim())) errors.phone = "Enter a phone number such as 1800 102 2929";
  if (v.email?.trim() && !EMAIL.test(v.email.trim())) errors.email = "Enter an email address";
  return errors;
}

/** Add a vendor, or change one's contact details. */
export function VendorDialog({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor | null;
  onClose: () => void;
  onSaved?: (vendor: Vendor) => void;
}) {
  const [values, setValues] = useState<VendorInput>({
    vendorName: vendor?.vendorName ?? "",
    vendorType: vendor?.vendorType ?? "SERVICE_PROVIDER",
    contactPerson: vendor?.contactPerson ?? "",
    phone: vendor?.phone ?? "",
    email: vendor?.email ?? "",
    address: vendor?.address ?? "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const save = useSaveVendor();
  const errors = submitted ? vendorErrors(values) : {};
  const set = (k: keyof VendorInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues({ ...values, [k]: e.target.value });
  const text = (k: keyof VendorInput, label: string, opts: { required?: boolean; type?: string; placeholder?: string } = {}) => (
    <Field field={`vendor-${k}`} label={label} required={opts.required} error={errors[k]}>
      <Input
        {...describedBy(`vendor-${k}`, errors[k])}
        type={opts.type}
        value={values[k] ?? ""}
        onChange={set(k)}
        maxLength={200}
        placeholder={opts.placeholder}
        className={cn(errors[k] && ERROR_BORDER)}
      />
    </Field>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSubmitted(true);
    setServerError(undefined);
    if (Object.keys(vendorErrors(values)).length) return;
    const trimmed = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
    ) as VendorInput;
    try {
      const saved = await save.mutateAsync({
        id: vendor?.id,
        // A new vendor leaves blank details out; a change sends blanks to clear them.
        body: vendor
          ? trimmed
          : (Object.fromEntries(Object.entries(trimmed).filter(([, v]) => v !== "")) as unknown as VendorInput),
      });
      toast.success(vendor ? "Vendor updated" : `${saved.vendorName} added`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setServerError((err as Error).message || "Could not save. Please try again.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit vendor" : "Add a vendor"}</DialogTitle>
          <DialogDescription>Who to call when a covered device breaks down.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          {text("vendorName", "Name", { required: true, placeholder: "Philips Healthcare India" })}
          <Field field="vendor-vendorType" label="Kind" required>
            <select {...describedBy("vendor-vendorType")} value={values.vendorType} onChange={set("vendorType")} className={SELECT_CLASS}>
              {(Object.keys(VENDOR_TYPE_LABEL) as VendorType[]).map((t) => (
                <option key={t} value={t}>
                  {VENDOR_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("contactPerson", "Contact person", { placeholder: "Service engineer or manager" })}
            {text("phone", "Phone", { type: "tel", placeholder: "1800 102 2929" })}
          </div>
          {text("email", "Email", { type: "email" })}
          <Field field="vendor-address" label="Address">
            <Textarea {...describedBy("vendor-address")} value={values.address ?? ""} onChange={set("address")} rows={2} maxLength={500} />
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
              {save.isPending ? "Saving…" : vendor ? "Save changes" : "Add vendor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
