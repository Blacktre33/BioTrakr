"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, Pencil, ShieldCheck } from "lucide-react";

import { AssetBedsideCard } from "@/components/scan/asset-bedside-card";
import { Button, Skeleton } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { useAsset } from "@/lib/hooks/use-assets";
import { useAssetFormReference } from "@/lib/hooks/use-asset-form-reference";
import { useAssetLookup } from "@/lib/hooks/use-asset-lookup";
import { useStatusHistory } from "@/lib/hooks/use-asset-status";
import { formatDate } from "@/lib/utils";

import { ChangeStatusDialog } from "./change-status-dialog";
import { EditAssetDialog } from "./edit-asset-dialog";

/** Must match the API's BIOMED_ROLES and ASSET_EDITOR_ROLES (auth/roles.ts). */
const BIOMED_ROLES = ["admin", "engineer", "technician"];
const EDITOR_ROLES = ["admin", "engineer"];

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Changed by hand",
  FAULT_REPORT: "Problem reported",
  WORK_ORDER: "Work order",
  DEVICE_ALERT: "Device alert",
  IMPORT: "Excel import",
};

/**
 * One device: the same safety answer staff get when they scan it, plus
 * biomed actions (change status with a reason, edit details) and the full
 * status history.
 */
export function DevicePage({ assetId }: { assetId: string }) {
  const role = getSession()?.user.role;
  const canChangeStatus = role ? BIOMED_ROLES.includes(role) : false;
  const canEdit = role ? EDITOR_ROLES.includes(role) : false;

  const lookup = useAssetLookup(assetId);
  const history = useStatusHistory(assetId);
  const reference = useAssetFormReference(canChangeStatus || canEdit);
  const full = useAsset(canEdit ? assetId : null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const device = lookup.data && !lookup.isError ? lookup.data : null;
  const statusLabel = (value: string) =>
    reference.data?.enums.assetStatus.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/assets" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All devices
      </Link>

      {lookup.isPending && (
        <div className="space-y-3" aria-label="Loading device">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      )}

      {lookup.isError && (
        <div role="alert" className="rounded-2xl border border-critical-500/40 bg-critical-500/10 p-4 text-gray-100">
          <p className="font-semibold">
            {(lookup.error as { statusCode?: number }).statusCode === 404
              ? "Device not found"
              : "Couldn't load this device. Do not assume it is safe to use."}
          </p>
          <p className="mt-1 text-sm">{(lookup.error as Error).message}</p>
        </div>
      )}

      {device && (
        <>
          {(canChangeStatus || canEdit) && (
            <div className="flex flex-wrap gap-2">
              {canChangeStatus && (
                <Button
                  type="button"
                  variant="secondary"
                  leftIcon={<ShieldCheck className="h-4 w-4" />}
                  onClick={() => setStatusOpen(true)}
                  disabled={!reference.data}
                >
                  Change status
                </Button>
              )}
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  leftIcon={<Pencil className="h-4 w-4" />}
                  onClick={() => setEditOpen(true)}
                  disabled={!reference.data || !full.data}
                >
                  Edit details
                </Button>
              )}
            </div>
          )}

          <AssetBedsideCard asset={device} scannedCode={device.assetTagNumber} role={role} />

          <section aria-labelledby="status-history-heading" className="rounded-2xl border border-white/10 p-4">
            <h2 id="status-history-heading" className="flex items-center gap-2 font-medium text-gray-200">
              <History className="h-4 w-4" aria-hidden="true" /> Status history
            </h2>
            {history.isPending ? (
              <Skeleton className="mt-3 h-12 w-full" />
            ) : history.data && history.data.length > 0 ? (
              <ol className="mt-3 space-y-3">
                {history.data.map((c) => (
                  <li key={c.id} className="border-l-2 border-white/10 pl-3 text-sm">
                    <p className="text-gray-100">
                      {statusLabel(c.fromStatus)} → <strong>{statusLabel(c.toStatus)}</strong>
                    </p>
                    <p className="text-gray-300">{c.reason}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(c.changedAt, "MMM d, yyyy HH:mm")} · {c.changedBy ?? "System"} ·{" "}
                      {SOURCE_LABEL[c.source] ?? c.source}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No status changes recorded yet.</p>
            )}
          </section>

          {reference.data && (
            <ChangeStatusDialog
              open={statusOpen}
              onOpenChange={setStatusOpen}
              assetId={assetId}
              equipmentName={device.equipmentName}
              currentStatus={device.assetStatus}
              statusOptions={reference.data.enums.assetStatus}
              openWorkOrders={device.openWorkOrders}
            />
          )}
          {reference.data && full.data && (
            <EditAssetDialog open={editOpen} onOpenChange={setEditOpen} asset={full.data} reference={reference.data} />
          )}
        </>
      )}
    </div>
  );
}
