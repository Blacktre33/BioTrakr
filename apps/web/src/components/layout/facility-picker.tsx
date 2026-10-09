"use client";

import { useAssetFormReference } from "@/lib/hooks/use-asset-form-reference";

/** Narrows a page to one facility; hidden when the organization has only one. */
export function FacilityPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const reference = useAssetFormReference();
  const facilities = reference.data?.facilities ?? [];
  if (facilities.length < 2) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-gray-400">
      Facility
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-surface-200/60 px-3 py-2 text-sm text-gray-100"
      >
        <option value="">All facilities</option>
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}
