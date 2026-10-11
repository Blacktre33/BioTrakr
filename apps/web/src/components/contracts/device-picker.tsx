"use client";

import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";

import { Input } from "@/components/ui";
import type { ContractDevice } from "@/lib/api/contracts";
import { useAssets } from "@/lib/hooks/use-assets";
import { cn } from "@/lib/utils";

export type PickedDevice = Pick<ContractDevice, "id" | "assetTagNumber" | "equipmentName">;

/** Search the register by tag, name or serial and add devices to a list. */
export function DevicePicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  value: PickedDevice[];
  onChange: (next: PickedDevice[]) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  // Search as people stop typing, not on every key.
  useEffect(() => {
    const t = setTimeout(() => setSearch(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  const results = useAssets({ search, take: 8, sort: "tag" });
  const chosen = new Set(value.map((d) => d.id));
  const options = search ? (results.data?.items ?? []).filter((a) => !chosen.has(a.id)) : [];

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul aria-label="Devices covered" className="flex flex-wrap gap-2">
          {value.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-1 rounded-lg bg-primary-500/15 py-1 pl-2 pr-1 text-sm text-gray-100"
            >
              {d.equipmentName} <span className="font-mono text-xs text-gray-400">{d.assetTagNumber}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v.id !== d.id))}
                aria-label={`Remove ${d.equipmentName} (${d.assetTagNumber})`}
                className="rounded p-0.5 text-gray-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
        <Input
          id={id}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by tag, name or serial number"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn("pl-9", invalid && "border-critical-500/60")}
        />
      </div>
      {search && (
        <ul aria-label="Matching devices" className="divide-y divide-white/5 rounded-xl border border-white/10">
          {results.isPending ? (
            <li className="p-2 text-sm text-gray-400">Searching…</li>
          ) : options.length === 0 ? (
            <li className="p-2 text-sm text-gray-400">No other devices match “{search}”.</li>
          ) : (
            options.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...value, { id: a.id, assetTagNumber: a.assetTagNumber, equipmentName: a.equipmentName }]);
                    setTerm("");
                    setSearch("");
                  }}
                  className="flex w-full items-center gap-2 p-2 text-left text-sm text-gray-200 hover:bg-white/5"
                >
                  <Plus className="h-4 w-4 text-primary-400" aria-hidden="true" />
                  <span>
                    Add {a.equipmentName} <span className="font-mono text-xs text-gray-400">{a.assetTagNumber}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
