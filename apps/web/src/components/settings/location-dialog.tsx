"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ERROR_BORDER, Field, describedBy } from "@/components/forms/form-field";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import type { LocationKind } from "@/lib/api/admin";
import { useSaveLocation } from "@/lib/hooks/use-admin";
import { cn } from "@/lib/utils";

/** Same rule as the API: codes go on labels and in spreadsheets. */
const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const CODE_HINT = "Short, no spaces — letters, numbers, - or _";

interface FieldSpec {
  name: string;
  label: string;
  required?: boolean;
  /** Fixed once created (other records and labels refer to it). */
  createOnly?: boolean;
  code?: boolean;
  number?: boolean;
  hint?: string;
  placeholder?: string;
}

const SPECS: Record<LocationKind, { noun: string; parentKey?: string; fields: FieldSpec[] }> = {
  facilities: {
    noun: "facility",
    fields: [
      { name: "facilityName", label: "Name", required: true, placeholder: "City General Hospital" },
      { name: "facilityCode", label: "Code", required: true, code: true, hint: CODE_HINT, placeholder: "CG" },
      { name: "facilityType", label: "Type", placeholder: "Hospital, clinic…" },
      { name: "city", label: "City" },
      { name: "timezone", label: "Time zone", hint: "e.g. Asia/Kolkata", placeholder: "Asia/Kolkata" },
    ],
  },
  departments: {
    noun: "department",
    parentKey: "facilityId",
    fields: [
      { name: "departmentName", label: "Name", required: true, placeholder: "Intensive Care Unit" },
      { name: "departmentCode", label: "Code", required: true, code: true, hint: CODE_HINT, placeholder: "ICU" },
      { name: "costCenter", label: "Cost centre" },
    ],
  },
  buildings: {
    noun: "building",
    parentKey: "facilityId",
    fields: [
      { name: "buildingName", label: "Name", required: true, placeholder: "Main block" },
      { name: "buildingCode", label: "Code", required: true, code: true, createOnly: true, hint: CODE_HINT, placeholder: "MAIN" },
    ],
  },
  floors: {
    noun: "floor",
    parentKey: "buildingId",
    fields: [
      {
        name: "floorNumber",
        label: "Floor number",
        required: true,
        number: true,
        createOnly: true,
        hint: "Ground = 0, basements are negative",
      },
      { name: "floorName", label: "Name", placeholder: "Second floor" },
    ],
  },
  rooms: {
    noun: "room",
    parentKey: "floorId",
    fields: [
      { name: "roomName", label: "Name", required: true, placeholder: "ICU Bay 3" },
      { name: "roomCode", label: "Code", required: true, code: true, createOnly: true, hint: CODE_HINT, placeholder: "ICU-3" },
      { name: "roomType", label: "Type", placeholder: "Ward, theatre, store…" },
    ],
  },
};

export interface LocationDialogTarget {
  kind: LocationKind;
  /** Set when editing. */
  id?: string;
  /** The parent's id when adding (facility, building or floor). */
  parentId?: string;
  /** Where it goes, shown to the user ("in City General"). */
  context?: string;
  initial?: Record<string, unknown>;
}

/** Add or rename one level of the location tree. */
export function LocationDialog({ target, onClose }: { target: LocationDialogTarget | null; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const save = useSaveLocation();

  useEffect(() => {
    if (!target) return;
    const init: Record<string, string> = {};
    for (const f of SPECS[target.kind].fields) {
      const v = target.initial?.[f.name];
      init[f.name] = v == null ? "" : String(v);
    }
    if (target.kind === "facilities" && !target.id && !init.timezone) init.timezone = "Asia/Kolkata";
    setValues(init);
    setSubmitted(false);
    setServerError(undefined);
  }, [target]);

  if (!target) return null;
  const spec = SPECS[target.kind];
  const editing = Boolean(target.id);
  const fields = spec.fields.filter((f) => !(editing && f.createOnly));

  const errorFor = (f: FieldSpec): string | undefined => {
    const v = (values[f.name] ?? "").trim();
    if (f.required && !v) return `Enter the ${f.label.toLowerCase()}`;
    if (v && f.code && !CODE.test(v)) return "No spaces: use letters, numbers, - or _";
    if (v && f.number && !/^-?\d+$/.test(v)) return "Use a whole number";
    return undefined;
  };
  const show = (f: FieldSpec) => (submitted ? errorFor(f) : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (fields.some(errorFor)) return;

    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const v = (values[f.name] ?? "").trim();
      const before = target!.initial?.[f.name];
      if (!editing && !v) continue; // optional and blank
      if (editing && v === (before == null ? "" : String(before))) continue;
      body[f.name] = f.number ? Number(v) : v;
    }
    if (!editing && spec.parentKey) body[spec.parentKey] = target!.parentId;
    if (editing && Object.keys(body).length === 0) {
      onClose();
      return;
    }
    try {
      await save.mutateAsync({ kind: target!.kind, id: target!.id, body });
      toast.success(editing ? "Saved" : `Added ${spec.noun}`);
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save. Please try again.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${spec.noun}` : `Add ${spec.noun}`}</DialogTitle>
          {target.context && <DialogDescription>{target.context}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          {fields.map((f) => {
            const id = `loc-${f.name}`;
            return (
              <Field key={f.name} field={id} label={f.label} required={f.required} error={show(f)} hint={f.hint}>
                <Input
                  {...describedBy(id, show(f), f.hint)}
                  inputMode={f.number ? "numeric" : undefined}
                  value={values[f.name] ?? ""}
                  placeholder={f.placeholder}
                  maxLength={f.code ? 30 : 200}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className={cn(show(f) && ERROR_BORDER)}
                />
              </Field>
            );
          })}
          {serverError && (
            <p role="alert" className="text-sm text-critical-500">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" isLoading={save.isPending}>
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
