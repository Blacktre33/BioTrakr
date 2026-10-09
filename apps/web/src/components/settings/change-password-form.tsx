"use client";

import { useState, type FormEvent } from "react";

import { ERROR_BORDER, Field, describedBy } from "@/components/forms/form-field";
import { Button, Input } from "@/components/ui";
import { changeOwnPassword } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { setSession, type Session } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/** Must match the API's minimum (password-policy.ts). */
export const MIN_PASSWORD_LENGTH = 10;

const NEW_HINT = `At least ${MIN_PASSWORD_LENGTH} characters. A short phrase you will remember works well.`;

type Fields = "currentPassword" | "newPassword" | "confirm";

/**
 * Current password, new password twice. On success this device gets a fresh
 * sign-in (every other one ends) and `onChanged` is called with it.
 */
export function ChangePasswordForm({
  currentLabel = "Current password",
  submitLabel = "Change password",
  onChanged,
}: {
  currentLabel?: string;
  submitLabel?: string;
  onChanged: (session: Session) => void;
}) {
  const [values, setValues] = useState<Record<Fields, string>>({ currentPassword: "", newPassword: "", confirm: "" });
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; field?: Fields }>();
  const [saving, setSaving] = useState(false);

  const errors: Partial<Record<Fields, string>> = {
    currentPassword: values.currentPassword ? undefined : `Enter your ${currentLabel.toLowerCase()}`,
    newPassword:
      values.newPassword.length < MIN_PASSWORD_LENGTH
        ? `Use at least ${MIN_PASSWORD_LENGTH} characters`
        : undefined,
    confirm: values.confirm !== values.newPassword ? "The two new passwords are not the same" : undefined,
  };
  const show = (f: Fields) =>
    (submitted ? errors[f] : undefined) ?? (serverError?.field === f ? serverError.message : undefined);

  const set = (f: Fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    if (serverError?.field === f) setServerError(undefined);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    try {
      const session = await changeOwnPassword(values.currentPassword, values.newPassword);
      setSession(session);
      setValues({ currentPassword: "", newPassword: "", confirm: "" });
      setSubmitted(false);
      onChanged(session);
    } catch (err) {
      const fields = (err instanceof ApiError ? (err.details as { fields?: string[] })?.fields : undefined) ?? [];
      setServerError({
        message: err instanceof Error ? err.message : "Could not change the password. Please try again.",
        field: (fields[0] as Fields | undefined) ?? undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field field="currentPassword" label={currentLabel} required error={show("currentPassword")}>
        <Input
          {...describedBy("currentPassword", show("currentPassword"))}
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={set("currentPassword")}
          className={cn(show("currentPassword") && ERROR_BORDER)}
        />
      </Field>
      <Field field="newPassword" label="New password" required error={show("newPassword")} hint={NEW_HINT}>
        <Input
          {...describedBy("newPassword", show("newPassword"), NEW_HINT)}
          type="password"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={set("newPassword")}
          className={cn(show("newPassword") && ERROR_BORDER)}
        />
      </Field>
      <Field field="confirm" label="New password again" required error={show("confirm")}>
        <Input
          {...describedBy("confirm", show("confirm"))}
          type="password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={set("confirm")}
          className={cn(show("confirm") && ERROR_BORDER)}
        />
      </Field>
      {serverError && !serverError.field && (
        <p role="alert" className="text-sm text-critical-500">
          {serverError.message}
        </p>
      )}
      <Button type="submit" isLoading={saving}>
        {submitLabel}
      </Button>
    </form>
  );
}
