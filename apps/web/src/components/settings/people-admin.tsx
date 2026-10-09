"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Copy, KeyRound, Pencil, Plus, UserCheck, UserX, Users } from "lucide-react";
import { toast } from "sonner";

import { ERROR_BORDER, Field, SELECT_CLASS, describedBy } from "@/components/forms/form-field";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
} from "@/components/ui";
import type { FacilityNode, StaffAccount } from "@/lib/api/admin";
import { getSession, ROLE_LABEL } from "@/lib/auth/session";
import { useCreateStaff, useLocations, useResetStaffPassword, useStaff, useUpdateStaff } from "@/lib/hooks/use-admin";
import { cn } from "@/lib/utils";

/** Roles a person can hold, with what each can do. Integration accounts are for machines. */
const ROLE_CHOICES = [
  { value: "clinical_staff", hint: "Scan devices and report problems" },
  { value: "technician", hint: "Work orders and device status" },
  { value: "engineer", hint: "Also add and edit devices, import spreadsheets" },
  { value: "viewer", hint: "Look only" },
  { value: "admin", hint: "Everything, including this page" },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fullName = (u: Pick<StaffAccount, "firstName" | "lastName">) => `${u.firstName} ${u.lastName}`.trim();

function formatWhen(iso: string | null): string {
  if (!iso) return "Never signed in";
  return `Last signed in ${new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

// --------------------------------------------------------- one-time password

function TemporaryPasswordDialog({
  shown,
  onClose,
}: {
  shown: { name: string; email: string; password: string } | null;
  onClose: () => void;
}) {
  if (!shown) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown.password);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy. Select the password and copy it by hand.");
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>One-time password for {shown.name}</DialogTitle>
          <DialogDescription>
            Give it to them in person or by phone, not by email. They sign in with <strong>{shown.email}</strong> and this
            password, then choose their own. It will not be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-200/50 p-3">
          <code className="flex-1 select-all break-all font-mono text-lg tracking-wider text-gray-100">
            {shown.password}
          </code>
          <Button size="sm" variant="secondary" leftIcon={<Copy className="h-4 w-4" />} onClick={copy}>
            Copy
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------- add / edit

interface PersonForm {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  jobTitle: string;
  facilityId: string;
  departmentId: string;
}

const EMPTY: PersonForm = {
  firstName: "",
  lastName: "",
  email: "",
  role: "clinical_staff",
  jobTitle: "",
  facilityId: "",
  departmentId: "",
};

function PersonDialog({
  editing,
  open,
  facilities,
  onClose,
  onCreated,
}: {
  editing: StaffAccount | null;
  open: boolean;
  facilities: FacilityNode[];
  onClose: () => void;
  onCreated: (shown: { name: string; email: string; password: string }) => void;
}) {
  const [form, setForm] = useState<PersonForm>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const create = useCreateStaff();
  const update = useUpdateStaff();
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            firstName: editing.firstName,
            lastName: editing.lastName,
            email: editing.email,
            role: editing.role,
            jobTitle: editing.jobTitle ?? "",
            facilityId: editing.facilityId ?? "",
            departmentId: editing.departmentId ?? "",
          }
        : EMPTY,
    );
    setSubmitted(false);
    setServerError(undefined);
  }, [open, editing]);

  const departments = facilities.find((f) => f.id === form.facilityId)?.departments ?? [];
  const errors: Partial<Record<keyof PersonForm, string>> = {
    firstName: form.firstName.trim() ? undefined : "Enter their first name",
    lastName: form.lastName.trim() ? undefined : "Enter their last name",
    email: editing || EMAIL.test(form.email.trim()) ? undefined : "Enter their work email",
  };
  const show = (k: keyof PersonForm) => (submitted ? errors[k] : undefined);
  const set = (k: keyof PersonForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value, ...(k === "facilityId" ? { departmentId: "" } : {}) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (Object.values(errors).some(Boolean)) return;
    const optional = (v: string) => (v.trim() ? v.trim() : undefined);
    try {
      if (editing) {
        const body: Record<string, string | null> = {};
        const before: Record<string, string> = {
          firstName: editing.firstName,
          lastName: editing.lastName,
          role: editing.role,
          jobTitle: editing.jobTitle ?? "",
          facilityId: editing.facilityId ?? "",
          departmentId: editing.departmentId ?? "",
        };
        for (const key of Object.keys(before)) {
          const v = form[key as keyof PersonForm].trim();
          if (v === before[key]) continue;
          // Blank placement means "not set"; the API keeps the pair consistent.
          body[key] = v || (key === "facilityId" || key === "departmentId" ? null : v);
        }
        if (body.facilityId === null) delete body.departmentId;
        if (Object.keys(body).length) {
          await update.mutateAsync({ id: editing.id, body });
          toast.success(
            body.role ? `${fullName(form)} is now ${ROLE_LABEL[body.role] ?? body.role}; they will sign in again` : "Saved",
          );
        }
        onClose();
      } else {
        const { user, temporaryPassword } = await create.mutateAsync({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          role: form.role,
          jobTitle: optional(form.jobTitle),
          facilityId: optional(form.facilityId),
          departmentId: optional(form.departmentId),
        });
        onClose();
        onCreated({ name: fullName(user), email: user.email, password: temporaryPassword });
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${fullName(editing)}` : "Add a person"}</DialogTitle>
          {!editing && (
            <DialogDescription>You will get a one-time password to give them. They choose their own at first sign-in.</DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field field="p-first" label="First name" required error={show("firstName")}>
              <Input
                {...describedBy("p-first", show("firstName"))}
                value={form.firstName}
                onChange={set("firstName")}
                maxLength={100}
                className={cn(show("firstName") && ERROR_BORDER)}
              />
            </Field>
            <Field field="p-last" label="Last name" required error={show("lastName")}>
              <Input
                {...describedBy("p-last", show("lastName"))}
                value={form.lastName}
                onChange={set("lastName")}
                maxLength={100}
                className={cn(show("lastName") && ERROR_BORDER)}
              />
            </Field>
          </div>
          {!editing && (
            <Field field="p-email" label="Work email" required error={show("email")} hint="They sign in with this">
              <Input
                {...describedBy("p-email", show("email"), "They sign in with this")}
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={set("email")}
                maxLength={254}
                className={cn(show("email") && ERROR_BORDER)}
              />
            </Field>
          )}
          <Field field="p-role" label="Role" required>
            <select {...describedBy("p-role")} value={form.role} onChange={set("role")} className={SELECT_CLASS}>
              {ROLE_CHOICES.map((r) => (
                <option key={r.value} value={r.value}>
                  {ROLE_LABEL[r.value]} — {r.hint}
                </option>
              ))}
              {editing && !ROLE_CHOICES.some((r) => r.value === form.role) && (
                <option value={form.role}>{ROLE_LABEL[form.role] ?? form.role}</option>
              )}
            </select>
          </Field>
          <Field field="p-title" label="Job title">
            <Input
              {...describedBy("p-title")}
              value={form.jobTitle}
              onChange={set("jobTitle")}
              maxLength={100}
              placeholder="Staff nurse, ICU"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field field="p-facility" label="Facility">
              <select {...describedBy("p-facility")} value={form.facilityId} onChange={set("facilityId")} className={SELECT_CLASS}>
                <option value="">Not set</option>
                {facilities
                  .filter((f) => f.isActive || f.id === form.facilityId)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.facilityName}
                    </option>
                  ))}
              </select>
            </Field>
            <Field field="p-dept" label="Department">
              <select
                {...describedBy("p-dept")}
                value={form.departmentId}
                onChange={set("departmentId")}
                className={SELECT_CLASS}
                disabled={!form.facilityId}
              >
                <option value="">{form.facilityId ? "Not set" : "Choose a facility first"}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.departmentName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {serverError && (
            <p role="alert" className="text-sm text-critical-500">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              {editing ? "Save" : "Add and get password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------- confirm

interface Pending {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  run: () => Promise<void>;
}

function ConfirmDialog({ pending, onClose }: { pending: Pending | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!pending) return null;
  const go = async () => {
    setBusy(true);
    try {
      await pending.run();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not do that. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{pending.title}</DialogTitle>
          <DialogDescription>{pending.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={pending.danger ? "danger" : "primary"} onClick={go} isLoading={busy}>
            {pending.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------- page

/** Staff accounts: add people, change roles, reset passwords, deactivate leavers. */
export function PeopleAdmin() {
  const staff = useStaff();
  const locations = useLocations();
  const update = useUpdateStaff();
  const reset = useResetStaffPassword();
  const [dialog, setDialog] = useState<{ editing: StaffAccount | null } | null>(null);
  const [shown, setShown] = useState<{ name: string; email: string; password: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [query, setQuery] = useState("");
  const [me, setMe] = useState<string>();
  useEffect(() => setMe(getSession()?.user.id), []);

  const facilities = useMemo(() => locations.data ?? [], [locations.data]);
  const placeOf = (u: StaffAccount) => {
    const f = facilities.find((x) => x.id === u.facilityId);
    const d = f?.departments.find((x) => x.id === u.departmentId);
    return [d?.departmentName, f?.facilityName].filter(Boolean).join(", ");
  };

  const q = query.trim().toLowerCase();
  const people = (staff.data ?? []).filter(
    (u) => !q || fullName(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
  );

  const askReset = (u: StaffAccount) =>
    setPending({
      title: `Reset ${fullName(u)}'s password?`,
      body: "Their current password stops working and they are signed out everywhere. You will get a new one-time password to give them.",
      confirm: "Reset password",
      run: async () => {
        const { temporaryPassword } = await reset.mutateAsync(u.id);
        setShown({ name: fullName(u), email: u.email, password: temporaryPassword });
      },
    });

  const askActive = (u: StaffAccount) =>
    setPending(
      u.isActive
        ? {
            title: `Deactivate ${fullName(u)}?`,
            body: "They are signed out everywhere and cannot sign in. Their history (scans, reports, work) is kept. You can reactivate them later.",
            confirm: "Deactivate",
            danger: true,
            run: async () => {
              await update.mutateAsync({ id: u.id, body: { isActive: false } });
              toast.success(`${fullName(u)} is deactivated`);
            },
          }
        : {
            title: `Reactivate ${fullName(u)}?`,
            body: "They can sign in again with their existing password. Reset it if they have forgotten it.",
            confirm: "Reactivate",
            run: async () => {
              await update.mutateAsync({ id: u.id, body: { isActive: true } });
              toast.success(`${fullName(u)} can sign in again`);
            },
          },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Search people"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex-1" />
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setDialog({ editing: null })}>
          Add person
        </Button>
      </div>

      {staff.isLoading && <Skeleton className="h-40 w-full" />}
      {staff.error && (
        <p role="alert" className="text-sm text-critical-500">
          Could not load people: {(staff.error as Error).message}
        </p>
      )}
      {staff.data && people.length === 0 && (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={q ? "Nobody matches" : "No accounts yet"}
          description={q ? "Try another name or email." : "Add the nurses, technicians and engineers who will use BioTrakr."}
        />
      )}

      {people.length > 0 && (
        <Card className="divide-y divide-white/5 p-0">
          {people.map((u) => {
            const locked = u.accountLockedUntil && new Date(u.accountLockedUntil) > new Date();
            const isMe = u.id === me;
            return (
              <div key={u.id} className={cn("flex flex-wrap items-center gap-3 p-4", !u.isActive && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-100">{fullName(u)}</span>
                    {isMe && <Badge size="sm">You</Badge>}
                    <Badge size="sm" variant={u.role === "admin" ? "primary" : "neutral"}>
                      {ROLE_LABEL[u.role] ?? u.role}
                    </Badge>
                    {!u.isActive && (
                      <Badge size="sm" variant="warning">
                        Deactivated
                      </Badge>
                    )}
                    {u.isActive && locked && (
                      <Badge size="sm" variant="critical">
                        Locked out
                      </Badge>
                    )}
                    {u.isActive && u.passwordChangeRequired && (
                      <Badge size="sm" variant="accent">
                        Has a one-time password
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-gray-400">
                    {u.email}
                    {u.jobTitle ? ` · ${u.jobTitle}` : ""}
                    {placeOf(u) ? ` · ${placeOf(u)}` : ""}
                  </p>
                  <p className="text-xs text-gray-500">{formatWhen(u.lastLoginAt)}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Pencil className="h-4 w-4" />}
                    onClick={() => setDialog({ editing: u })}
                  >
                    Edit
                  </Button>
                  {u.isActive && (
                    <Button size="sm" variant="ghost" leftIcon={<KeyRound className="h-4 w-4" />} onClick={() => askReset(u)}>
                      {locked ? "Unlock / reset" : "Reset password"}
                    </Button>
                  )}
                  {!isMe && (
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={u.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      onClick={() => askActive(u)}
                    >
                      {u.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <PersonDialog
        open={dialog !== null}
        editing={dialog?.editing ?? null}
        facilities={facilities}
        onClose={() => setDialog(null)}
        onCreated={setShown}
      />
      <TemporaryPasswordDialog shown={shown} onClose={() => setShown(null)} />
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}
