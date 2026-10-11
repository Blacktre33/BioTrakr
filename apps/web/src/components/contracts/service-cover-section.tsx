"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { Button, Skeleton } from "@/components/ui";
import { describeEnd } from "@/lib/api/contracts";
import { useDeviceCover } from "@/lib/hooks/use-contracts";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

import { ContractCard } from "./contract-card";
import { ContractDialog } from "./contract-dialog";

/**
 * Who maintains this device and until when: its warranty and its AMC/CMC
 * contracts, with the vendor's phone number for a breakdown.
 */
export function ServiceCoverSection({
  device,
  canEdit,
}: {
  device: { id: string; assetTagNumber: string; equipmentName: string };
  canEdit: boolean;
}) {
  const cover = useDeviceCover(device.id);
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const contracts = cover.data?.contracts ?? [];
  // The one in force first, then any renewal waiting to start.
  const current = contracts
    .filter((c) => c.status === "active" || c.status === "upcoming")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = contracts.filter((c) => c.status === "expired" || c.status === "terminated");
  const warranty = cover.data?.warranty;
  const earlier = cover.data?.earlierAmc;

  return (
    <section aria-labelledby="service-cover-heading" className="rounded-2xl border border-white/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="service-cover-heading" className="flex items-center gap-2 font-medium text-gray-200">
          <FileText className="h-4 w-4" aria-hidden="true" /> Warranty and contracts
        </h2>
        {canEdit && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setAdding(true)}
            className="ml-auto"
          >
            Add contract
          </Button>
        )}
      </div>

      {cover.isPending ? (
        <Skeleton className="mt-3 h-12 w-full" />
      ) : cover.isError ? (
        <p role="alert" className="mt-2 text-sm text-critical-500">
          Couldn&apos;t load cover: {cover.error.message}
        </p>
      ) : (
        <>
          <p className={cn("mt-2 text-sm", warranty?.active ? "text-gray-300" : "text-gray-400")}>
            {warranty?.endDate
              ? warranty.active
                ? `Under warranty until ${formatDate(warranty.endDate)} (${describeEnd(warranty.daysLeft!)})`
                : `Warranty ended ${formatDate(warranty.endDate)}`
              : "No warranty date recorded."}
          </p>

          {current.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {current.map((c) => (
                <ContractCard key={c.id} contract={c} canAttach={canEdit} />
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-gray-400">
              {warranty?.active ? "No AMC or CMC yet." : "Not covered by an AMC or CMC."}
              {canEdit ? " Add one to get reminders before it ends." : ""}
            </p>
          )}

          {earlier && (
            <p className="mt-2 text-sm text-gray-400">
              Recorded on the device earlier: AMC {earlier.contractNumber ?? "(no number)"}
              {earlier.endDate ? ` until ${formatDate(earlier.endDate)}` : ""}
              {earlier.annualCost !== null ? `, ${formatCurrency(earlier.annualCost)} a year` : ""}. Add it as a contract
              to get reminders.
            </p>
          )}

          {past.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                aria-expanded={showPast}
                onClick={() => setShowPast(!showPast)}
                className="text-sm text-primary-400 hover:underline"
              >
                {showPast ? "Hide" : "Show"} earlier contracts ({past.length})
              </button>
              {showPast && (
                <ul className="mt-2 space-y-3">
                  {past.map((c) => (
                    <ContractCard key={c.id} contract={c} canAttach={canEdit} />
                  ))}
                </ul>
              )}
            </div>
          )}

          {canEdit && contracts.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              Renew or change contracts on the{" "}
              <Link href={"/contracts" as Route} className="text-primary-400 hover:underline">
                Contracts page
              </Link>
              .
            </p>
          )}
        </>
      )}

      {adding && (
        <ContractDialog
          mode="create"
          devices={[{ id: device.id, assetTagNumber: device.assetTagNumber, equipmentName: device.equipmentName }]}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}
