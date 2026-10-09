"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertOctagon, Search, X } from "lucide-react";

import { SELECT_CLASS } from "@/components/forms/form-field";
import { Button, Input, Skeleton } from "@/components/ui";
import type { AssetSort, ListAssetsParams } from "@/lib/api/assets";
import { useAssetFormReference } from "@/lib/hooks/use-asset-form-reference";
import { useAssets } from "@/lib/hooks/use-assets";
import { cn, formatDate } from "@/lib/utils";

export const PAGE_SIZE = 25;
const OUT_OF_USE = ["QUARANTINED", "IN_MAINTENANCE", "CONDEMNED", "RETIRED", "DISPOSED"];
const SORTS: Array<{ value: AssetSort; label: string }> = [
  { value: "tag", label: "Tag" },
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
  { value: "nextPm", label: "Next PM" },
  { value: "updated", label: "Recently changed" },
];

/**
 * Reads the list's filters from the URL, so a filtered view can be
 * bookmarked or linked (e.g. /assets?status=QUARANTINED&pmOverdue=1).
 */
export function paramsFromUrl(search: URLSearchParams): ListAssetsParams & { page: number } {
  const list = (key: string) => (search.get(key) ?? "").split(",").filter(Boolean);
  const sort = search.get("sort") as AssetSort | null;
  return {
    search: search.get("q") ?? undefined,
    status: list("status"),
    category: list("category"),
    criticality: list("criticality"),
    pmOverdue: search.get("pmOverdue") === "1",
    sort: sort && SORTS.some((s) => s.value === sort) ? sort : "tag",
    order: search.get("order") === "desc" ? "desc" : "asc",
    page: Math.max(0, Number(search.get("page") ?? 0) || 0),
  };
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function AssetList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => paramsFromUrl(new URLSearchParams(searchParams.toString())), [searchParams]);
  const reference = useAssetFormReference();
  const enums = reference.data?.enums;

  const [typed, setTyped] = useState(filters.search ?? "");
  const debounced = useDebounced(typed, 300);

  const setUrl = (changes: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}` as Route, { scroll: false });
  };

  // Search as the person types, without a request per keystroke.
  useEffect(() => {
    if ((filters.search ?? "") !== debounced) setUrl({ q: debounced.trim() || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { page, ...query } = filters;
  const assets = useAssets({ ...query, skip: page * PAGE_SIZE, take: PAGE_SIZE });
  const total = assets.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const label = (options: Array<{ value: string; label: string }> | undefined, value: string) =>
    options?.find((o) => o.value === value)?.label ?? value;

  const anyFilter =
    Boolean(filters.search) ||
    Boolean(filters.status?.length) ||
    Boolean(filters.category?.length) ||
    Boolean(filters.criticality?.length) ||
    filters.pmOverdue;

  const filterSelect = (key: "status" | "category" | "criticality", text: string, options?: Array<{ value: string; label: string }>) => (
    <div>
      <label htmlFor={`filter-${key}`} className="sr-only">
        {text}
      </label>
      <select
        id={`filter-${key}`}
        value={filters[key]?.[0] ?? ""}
        onChange={(e) => setUrl({ [key]: e.target.value || null })}
        className={cn(SELECT_CLASS, "py-2 text-sm")}
        disabled={!options}
      >
        <option value="">{text}: all</option>
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <div className="relative">
          <label htmlFor="asset-search" className="sr-only">
            Search devices
          </label>
          <Input
            id="asset-search"
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search tag, name, serial, make or model"
            leftIcon={<Search className="h-4 w-4" />}
            className="py-2"
          />
        </div>
        {filterSelect("status", "Status", enums?.assetStatus)}
        {filterSelect("category", "Category", enums?.deviceCategory)}
        {filterSelect("criticality", "Criticality", enums?.criticalityLevel)}
        <div className="flex gap-2">
          <label htmlFor="asset-sort" className="sr-only">
            Sort by
          </label>
          <select
            id="asset-sort"
            value={filters.sort}
            onChange={(e) => setUrl({ sort: e.target.value === "tag" ? null : e.target.value })}
            className={cn(SELECT_CLASS, "py-2 text-sm")}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={filters.order === "desc" ? "Sorted descending; switch to ascending" : "Sorted ascending; switch to descending"}
            onClick={() => setUrl({ order: filters.order === "desc" ? null : "desc" }, false)}
          >
            {filters.order === "desc" ? "↓" : "↑"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-gray-300">
          <input type="checkbox" checked={filters.pmOverdue} onChange={(e) => setUrl({ pmOverdue: e.target.checked ? "1" : null })} />
          PM overdue only
        </label>
        <span className="text-gray-400" aria-live="polite">
          {assets.isPlaceholderData ? "Loading…" : assets.data ? `${total} ${total === 1 ? "device" : "devices"}` : ""}
        </span>
        {anyFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<X className="h-4 w-4" />}
            onClick={() => {
              setTyped("");
              router.replace(pathname as Route, { scroll: false });
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {assets.isError && (
        <p role="alert" className="rounded-xl border border-critical-500/40 bg-critical-500/10 p-4 text-gray-100">
          Couldn&apos;t load devices: {(assets.error as Error).message}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Devices</caption>
          <thead className="bg-surface-200/40 text-xs uppercase text-gray-400">
            <tr>
              <th scope="col" className="px-4 py-3">Device</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="hidden px-4 py-3 md:table-cell">Category</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">Where</th>
              <th scope="col" className="px-4 py-3">Next PM</th>
            </tr>
          </thead>
          <tbody className={cn(assets.isPlaceholderData && "opacity-60")}>
            {assets.isPending &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td colSpan={5} className="px-4 py-3">
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))}
            {/* After a failed refresh the old rows would still be in data; their
                statuses may be out of date, so show the error instead. */}
            {!assets.isError && assets.data?.items.map((a) => {
              const out = OUT_OF_USE.includes(a.assetStatus);
              const overdue = a.nextPmDueDate ? new Date(a.nextPmDueDate).getTime() < Date.now() : false;
              return (
                <tr key={a.id} className="border-t border-white/5 hover:bg-surface-200/30">
                  <td className="px-4 py-3">
                    <Link href={`/assets/${a.id}` as Route} className="font-medium text-white hover:underline">
                      {a.equipmentName}
                    </Link>
                    <p className="font-mono text-xs text-gray-400">{a.assetTagNumber}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1", out ? "font-semibold text-critical-500" : "text-gray-200")}>
                      {out && <AlertOctagon className="h-3.5 w-3.5" aria-hidden="true" />}
                      {label(enums?.assetStatus, a.assetStatus)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-gray-300 md:table-cell">{label(enums?.deviceCategory, a.deviceCategory)}</td>
                  <td className="hidden px-4 py-3 text-gray-300 lg:table-cell">
                    {[a.currentRoom?.roomName, a.custodianDepartment?.departmentName, a.currentFacility?.facilityName]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className={cn("px-4 py-3", overdue ? "font-semibold text-critical-500" : "text-gray-300")}>
                    {a.nextPmDueDate ? `${overdue ? "Overdue · " : ""}${formatDate(a.nextPmDueDate)}` : "Not scheduled"}
                  </td>
                </tr>
              );
            })}
            {!assets.isError && assets.data && assets.data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {anyFilter ? "No devices match these filters." : "No devices yet. Add one, or import a spreadsheet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => setUrl({ page: String(page - 1) }, false)} disabled={page === 0}>
            Previous
          </Button>
          <span className="text-sm text-gray-400">
            Page {page + 1} of {pages}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setUrl({ page: String(page + 1) }, false)} disabled={page + 1 >= pages}>
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
