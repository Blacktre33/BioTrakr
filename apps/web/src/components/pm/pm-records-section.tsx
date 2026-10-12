"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";

import { Badge, Skeleton } from "@/components/ui";
import type { ItemResult, PmOutcome, PmRecord } from "@/lib/api/checklists";
import { rangeText } from "@/lib/checklists";
import { usePmRecords } from "@/lib/hooks/use-checklists";
import { formatDate } from "@/lib/utils";

const OUTCOME: Record<PmOutcome, { label: string; variant: "success" | "warning" | "critical" }> = {
  PASS: { label: "Passed", variant: "success" },
  FLAG: { label: "Passed, items flagged", variant: "warning" },
  FAIL: { label: "Failed", variant: "critical" },
};
const RESULT: Record<ItemResult, string> = { PASS: "Pass", FLAG: "Flag", FAIL: "Fail", NA: "N/A" };
const RESULT_TONE: Record<ItemResult, string> = {
  PASS: "text-success-500",
  FLAG: "text-warning-500",
  FAIL: "text-critical-500",
  NA: "text-gray-500",
};

function Record({ r }: { r: PmRecord }) {
  const [open, setOpen] = useState(false);
  const findings = r.items.filter((i) => i.result === "FLAG" || i.result === "FAIL");
  return (
    <li className="border-l-2 border-white/10 pl-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-100">{formatDate(r.recordedAt)}</span>
        <Badge variant={OUTCOME[r.outcome].variant} size="sm">
          {OUTCOME[r.outcome].label}
        </Badge>
        <span className="text-xs text-gray-400">
          {r.checklistName} · {r.recordedBy}
        </span>
      </div>
      {findings.map((i) => (
        <p key={i.key} className={RESULT_TONE[i.result]}>
          {RESULT[i.result]}: {i.text}
          {i.note ? `: ${i.note}` : ""}
        </p>
      ))}
      {r.testEquipment && <p className="text-xs text-gray-500">Test equipment: {r.testEquipment}</p>}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-xs text-primary-400 hover:underline"
      >
        {open ? "Hide" : "Show"} every item ({r.items.length})
      </button>
      {open && (
        <table className="mt-1 w-full text-xs">
          <caption className="sr-only">Checklist items</caption>
          <thead className="text-left text-gray-500">
            <tr>
              <th scope="col" className="py-1 pr-2 font-normal">
                Item
              </th>
              <th scope="col" className="py-1 pr-2 font-normal">
                Reading
              </th>
              <th scope="col" className="py-1 font-normal">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((i) => (
              <tr key={i.key} className="border-t border-white/5 align-top">
                <td className="py-1 pr-2 text-gray-300">{i.text}</td>
                <td className="py-1 pr-2 text-gray-300">
                  {i.reading !== null ? `${i.reading} ${i.unit ?? ""}` : ""}
                  {rangeText(i) ? <span className="block text-gray-500">limit {rangeText(i)}</span> : null}
                </td>
                <td className={`py-1 ${RESULT_TONE[i.result]}`}>
                  {RESULT[i.result]}
                  {i.note ? <span className="block text-gray-400">{i.note}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}

/** What each preventive maintenance of a device found, item by item. */
export function PmRecordsSection({ assetId }: { assetId: string }) {
  const records = usePmRecords(assetId);
  return (
    <section aria-labelledby="pm-records-heading" className="rounded-2xl border border-white/10 p-4">
      <h2 id="pm-records-heading" className="flex items-center gap-2 font-medium text-gray-200">
        <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Preventive maintenance checklists
      </h2>
      {records.isPending ? (
        <Skeleton className="mt-3 h-12 w-full" />
      ) : records.isError ? (
        <p role="alert" className="mt-2 text-sm text-critical-500">
          Couldn&apos;t load the PM records: {records.error.message}
        </p>
      ) : records.data.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No PM checklist recorded yet.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {records.data.map((r) => (
            <Record key={r.id} r={r} />
          ))}
        </ol>
      )}
    </section>
  );
}
