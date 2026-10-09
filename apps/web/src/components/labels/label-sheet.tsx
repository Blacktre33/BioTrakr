"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Printer } from "lucide-react";

import { paramsFromUrl } from "@/components/assets/asset-list";
import { SELECT_CLASS } from "@/components/forms/form-field";
import { Button, Input, Skeleton } from "@/components/ui";
import { getAsset, listAssets, type Asset, type ListAssetsParams } from "@/lib/api/assets";
import { useAssetFormReference } from "@/lib/hooks/use-asset-form-reference";
import { cn } from "@/lib/utils";

import { QrCode } from "./qr-code";

/** One print run; more than this is better split by department. */
export const MAX_LABELS = 500;
const BATCH = 100;
/** Labels on one A4 sheet of 63.5 × 38.1 mm stock (3 across, 7 down). */
export const PER_SHEET = 21;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const LABEL_SIZES = {
  sheet: {
    label: "A4 sheet, 21 per page (63.5 × 38.1 mm, e.g. Avery L7160)",
    page: "@page { size: A4; margin: 15.1mm 7.2mm 0 7.2mm; }",
  },
  roll: {
    label: "Label printer roll, 50 × 25 mm",
    page: "@page { size: 50mm 25mm; margin: 0; }",
  },
} as const;
export type LabelSize = keyof typeof LABEL_SIZES;

/** Where a phone's camera takes people: the scan page for this tag. */
export function scanUrl(base: string, tag: string): string {
  return `${base.replace(/\/+$/, "")}/scan?code=${encodeURIComponent(tag)}`;
}

/** The address printed into QR codes; a deployment can pin it with NEXT_PUBLIC_APP_URL. */
function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
}

function isLocalAddress(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return true;
  }
}

async function fetchForLabels(params: ListAssetsParams & { id?: string }): Promise<{ items: Asset[]; total: number }> {
  if (params.id) {
    const asset = await getAsset(params.id);
    return { items: [asset], total: 1 };
  }
  const items: Asset[] = [];
  let total = 0;
  for (let skip = 0; skip < MAX_LABELS; skip += BATCH) {
    const page = await listAssets({ ...params, skip, take: BATCH });
    total = page.total;
    items.push(...page.items);
    if (page.items.length < BATCH || items.length >= total) break;
  }
  return { items: items.slice(0, MAX_LABELS), total };
}

/**
 * Tag font size (pt) that keeps the tag on one line beside the QR code:
 * monospace glyphs are about 0.6 em wide. Very long tags wrap at the floor.
 */
export function tagFontPt(tag: string, size: LabelSize): number {
  const widthPt = (size === "sheet" ? 28.5 : 23.5) * 2.835;
  const max = size === "sheet" ? 11 : 8;
  return Math.max(6, Math.min(max, Math.floor((widthPt / (Math.max(tag.length, 1) * 0.6)) * 2) / 2));
}

export function DeviceLabel({ asset, base, size }: { asset: Asset; base: string; size: LabelSize }) {
  const place = [asset.custodianDepartment?.departmentName, asset.currentFacility?.facilityName]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className={cn(
        "label flex items-center overflow-hidden bg-white text-black",
        size === "sheet" ? "h-[38.1mm] w-[63.5mm] gap-[2mm] p-[2.5mm]" : "h-[25mm] w-[50mm] gap-[1.5mm] p-[1.5mm]",
      )}
    >
      <QrCode
        text={scanUrl(base, asset.assetTagNumber)}
        title={`QR code for ${asset.assetTagNumber}`}
        className={cn("shrink-0", size === "sheet" ? "h-[28mm] w-[28mm]" : "h-[22mm] w-[22mm]")}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
        <span
          className="font-mono font-bold [overflow-wrap:anywhere]"
          style={{ fontSize: `${tagFontPt(asset.assetTagNumber, size)}pt` }}
        >
          {asset.assetTagNumber}
        </span>
        <span className={cn("line-clamp-2", size === "sheet" ? "mt-[1mm] text-[8pt]" : "text-[6pt]")}>
          {asset.equipmentName}
        </span>
        {size === "sheet" && place && <span className="mt-[0.5mm] line-clamp-1 text-[6.5pt] text-gray-700">{place}</span>}
        <span className={cn("font-semibold", size === "sheet" ? "mt-[1.5mm] text-[7pt]" : "mt-[0.5mm] text-[5.5pt]")}>
          Scan before use
        </span>
      </div>
    </div>
  );
}

/**
 * Printable QR labels. Opened from the device list (current filters) or a
 * device page (?id=…). Each code links to /scan?code=<tag>, so any phone
 * camera opens the device's "safe to use?" card; the tag is printed too,
 * for typing when a code is damaged.
 */
export function LabelSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reference = useAssetFormReference();

  const id = searchParams.get("id") ?? undefined;
  const facilityId = searchParams.get("facility") ?? undefined;
  const departmentId = searchParams.get("department") ?? undefined;
  const size: LabelSize = searchParams.get("size") === "roll" ? "roll" : "sheet";
  const params = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { page, ...filters } = paramsFromUrl(new URLSearchParams(searchParams.toString()));
    return { ...filters, facilityId, departmentId, id };
  }, [searchParams, facilityId, departmentId, id]);

  const labels = useQuery({ queryKey: ["labels", params], queryFn: () => fetchForLabels(params) });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [base, setBase] = useState("");
  useEffect(() => setBase(appBaseUrl()), []);
  useEffect(() => setExcluded(new Set()), [params]);

  const setUrl = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}` as Route, { scroll: false });
  };

  const items = labels.data?.items ?? [];
  const chosen = items.filter((a) => !excluded.has(a.id));
  const departments = (reference.data?.departments ?? []).filter((d) => !facilityId || d.facilityId === facilityId);
  const truncated = labels.data && labels.data.total > items.length;

  const toggle = (assetId: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });

  return (
    <>
      {/* Only the labels are printed; this sets the paper size for the chosen stock. */}
      <style>{`@media print { ${LABEL_SIZES[size].page} html, body { background: #fff !important; } }`}</style>

      <div className="space-y-4 p-4 md:p-8 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={(id ? `/assets/${id}` : "/assets") as Route} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
          <h1 className="text-xl font-semibold text-gray-100">Print QR labels</h1>
        </div>

        {!id && (
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label htmlFor="labels-facility" className="mb-1 block text-sm text-gray-300">
                Facility
              </label>
              <select
                id="labels-facility"
                value={facilityId ?? ""}
                onChange={(e) => setUrl({ facility: e.target.value || null, department: null })}
                className={SELECT_CLASS}
              >
                <option value="">All facilities</option>
                {reference.data?.facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="labels-department" className="mb-1 block text-sm text-gray-300">
                Department
              </label>
              <select
                id="labels-department"
                value={departmentId ?? ""}
                onChange={(e) => setUrl({ department: e.target.value || null })}
                className={SELECT_CLASS}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="labels-search" className="mb-1 block text-sm text-gray-300">
                Tag or name contains
              </label>
              <Input
                id="labels-search"
                type="search"
                defaultValue={params.search ?? ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setUrl({ q: (e.target as HTMLInputElement).value.trim() || null });
                }}
                onBlur={(e) => setUrl({ q: e.target.value.trim() || null })}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="labels-size" className="mb-1 block text-sm text-gray-300">
              Label stock
            </label>
            <select
              id="labels-size"
              value={size}
              onChange={(e) => setUrl({ size: e.target.value === "roll" ? "roll" : null })}
              className={SELECT_CLASS}
            >
              {Object.entries(LABEL_SIZES).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <Button leftIcon={<Printer className="h-4 w-4" />} disabled={chosen.length === 0 || !base} onClick={() => window.print()}>
            Print {chosen.length} {chosen.length === 1 ? "label" : "labels"}
          </Button>
        </div>

        <p className="text-xs text-gray-500">
          In the print dialog choose scale 100% (&quot;Actual size&quot;) and turn off headers and footers. Print one test
          page on plain paper and hold it against the label sheet first.
        </p>

        {base && isLocalAddress(base) && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning-500/40 bg-warning-500/10 p-3 text-sm text-gray-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-500" aria-hidden />
            These codes would point to {base}, which phones on the ward cannot open. Print from the hospital&apos;s
            BioTrakr address instead, or set NEXT_PUBLIC_APP_URL.
          </p>
        )}
        {truncated && (
          <p role="alert" className="text-sm text-warning-500">
            Showing the first {MAX_LABELS} of {labels.data!.total} devices. Choose a facility or department to print the rest.
          </p>
        )}
        {labels.isLoading && <Skeleton className="h-40 w-full" />}
        {labels.error && (
          <p role="alert" className="text-sm text-critical-500">
            Could not load devices: {(labels.error as Error).message}
          </p>
        )}
        {labels.data && items.length === 0 && <p className="text-sm text-gray-400">No devices match these filters.</p>}

        {items.length > 1 && (
          <details className="rounded-xl border border-white/5 p-3">
            <summary className="cursor-pointer text-sm text-gray-300">
              Choose devices ({chosen.length} of {items.length} selected)
            </summary>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setExcluded(new Set())}>
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setExcluded(new Set(items.map((a) => a.id)))}>
                Select none
              </Button>
            </div>
            <ul className="mt-2 grid max-h-72 gap-1 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <li key={a.id}>
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" checked={!excluded.has(a.id)} onChange={() => toggle(a.id)} />
                    <span className="font-mono">{a.assetTagNumber}</span>
                    <span className="truncate text-gray-500">{a.equipmentName}</span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
        )}

        {chosen.length > 0 && base && <h2 className="text-sm font-medium text-gray-300">Preview</h2>}
      </div>

      {base && chosen.length > 0 && (
        <div className="overflow-x-auto px-4 pb-8 md:px-8 print:overflow-visible print:p-0" aria-label="Labels">
          {size === "sheet" ? (
            chunk(chosen, PER_SHEET).map((page, n) => (
              <div
                key={n}
                className="mb-6 grid w-max grid-cols-[repeat(3,63.5mm)] gap-x-[2.5mm] outline outline-1 outline-white/10 print:mb-0 print:break-after-page print:outline-none"
              >
                {page.map((a) => (
                  <DeviceLabel key={a.id} asset={a} base={base} size={size} />
                ))}
              </div>
            ))
          ) : (
            <div className="flex flex-wrap gap-2 print:block">
              {chosen.map((a) => (
                <div key={a.id} className="outline outline-1 outline-white/10 print:break-after-page print:outline-none">
                  <DeviceLabel asset={a} base={base} size={size} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
