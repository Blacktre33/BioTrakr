"use client";

import type { ReactNode } from "react";

import { Label } from "@/components/ui";

export const SELECT_CLASS =
  "w-full px-4 py-3 bg-surface-200/50 border border-white/5 rounded-xl text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-60";
export const ERROR_BORDER = "border-critical-500/60 focus:ring-critical-500/50";

export const errorId = (field: string) => `${field}-error`;
export const hintId = (field: string) => `${field}-hint`;

/** Props that tie a control to its label, error and hint for screen readers. */
export function describedBy(field: string, error?: string, hint?: string) {
  return {
    id: field,
    name: field,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId(field) : hint ? hintId(field) : undefined,
  } as const;
}

/** Label, control, and either the error (when there is one) or a hint underneath. */
export function Field({
  field,
  label,
  required,
  error,
  hint,
  children,
}: {
  field: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
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
