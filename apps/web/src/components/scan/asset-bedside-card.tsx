"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, CheckCircle2, Flag, MapPin, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button, Input, Label } from "@/components/ui";
import type { AssetLookup } from "@/lib/api/assets";
import { useCreateAssetScanMutation } from "@/lib/hooks/use-asset-scan-logs";
import { cn, formatDate } from "@/lib/utils";

import { ReportProblemDialog } from "./report-problem-dialog";

/** Roles that see the full technical detail straight away. */
const DETAIL_ROLES = ["admin", "engineer", "technician"];
/** Roles that may record a scan (matches the API's SCAN_ROLES). */
const SCAN_ROLES = ["admin", "engineer", "technician", "clinical_staff"];

const humanize = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

function SafetyBanner({ asset }: { asset: AssetLookup }) {
  const stops = asset.alerts.filter((a) => a.level === "stop");
  const cautions = asset.alerts.filter((a) => a.level === "caution");

  if (stops.length > 0) {
    return (
      <div role="alert" className="rounded-2xl border-2 border-critical-500 bg-critical-500/15 p-4">
        <p className="flex items-center gap-2 text-xl font-bold text-critical-500">
          <AlertOctagon className="h-7 w-7 shrink-0" aria-hidden="true" />
          Do not use
        </p>
        <ul className="mt-2 space-y-1 text-gray-100">
          {asset.alerts.map((a) => (
            <li key={a.message}>{a.message}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border-2 p-4",
        cautions.length ? "border-warning-500 bg-warning-500/10" : "border-success-500 bg-success-500/10",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 text-xl font-bold",
          cautions.length ? "text-warning-500" : "text-success-500",
        )}
      >
        {cautions.length ? (
          <AlertTriangle className="h-7 w-7 shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-7 w-7 shrink-0" aria-hidden="true" />
        )}
        {cautions.length ? "OK to use, but note" : "OK to use"}
      </p>
      {cautions.length > 0 && (
        <ul className="mt-2 space-y-1 text-gray-100">
          {cautions.map((a) => (
            <li key={a.message}>{a.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-gray-100">{value || "—"}</dd>
    </div>
  );
}

interface AssetBedsideCardProps {
  asset: AssetLookup;
  /** The code that was scanned or typed; stored with the scan record. */
  scannedCode: string;
  role?: string;
}

export function AssetBedsideCard({ asset, scannedCode, role }: AssetBedsideCardProps) {
  const queryClient = useQueryClient();
  const logScan = useCreateAssetScanMutation(asset.id);
  const [where, setWhere] = useState(asset.location.room ?? "");
  const [logged, setLogged] = useState(false);
  const [reporting, setReporting] = useState(false);
  const canLog = role ? SCAN_ROLES.includes(role) : false;

  const nextPm = asset.pm.nextPmDueDate;

  const onLog = async () => {
    try {
      await logScan.mutateAsync({
        assetId: asset.id,
        payload: { qrPayload: scannedCode, locationHint: where.trim() || undefined },
      });
      setLogged(true);
      toast.success("Logged. Thank you!");
      await queryClient.invalidateQueries({ queryKey: ["asset-lookup"] });
    } catch (error) {
      toast.error((error as Error).message || "Could not log the scan. Please try again.");
    }
  };

  return (
    <article className="space-y-5" aria-labelledby="asset-name">
      <SafetyBanner asset={asset} />

      <header>
        <h2 id="asset-name" className="text-2xl font-semibold text-white">
          {asset.equipmentName}
        </h2>
        <p className="text-gray-400">
          Tag <span className="font-mono text-gray-200">{asset.assetTagNumber}</span> · {asset.manufacturer}{" "}
          {asset.modelNumber}
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex gap-2">
          <MapPin className="mt-1 h-4 w-4 text-gray-500" aria-hidden="true" />
          <Detail label="Location" value={[asset.location.room, asset.location.facility].filter(Boolean).join(", ")} />
        </div>
        <Detail label="Department" value={asset.department} />
        <div className="flex gap-2">
          <Wrench className="mt-1 h-4 w-4 text-gray-500" aria-hidden="true" />
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Next maintenance</dt>
            <dd className={cn(asset.pm.overdue ? "font-semibold text-critical-500" : "text-gray-100")}>
              {nextPm ? `${asset.pm.overdue ? "Overdue since " : ""}${formatDate(nextPm)}` : "Not scheduled"}
            </dd>
          </div>
        </div>
      </dl>

      {canLog && (
        <section aria-label="Log this device" className="space-y-3 rounded-2xl bg-surface-200/30 p-4">
          {logged ? (
            <p className="flex items-center gap-2 text-success-500">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Logged{where.trim() ? ` at ${where.trim()}` : ""}.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="scan-where">Where is it now? (optional)</Label>
                <Input
                  id="scan-where"
                  value={where}
                  onChange={(e) => setWhere(e.target.value)}
                  placeholder="e.g. ICU bay 3"
                  maxLength={255}
                />
              </div>
              <Button type="button" className="w-full py-4 text-lg" onClick={onLog} disabled={logScan.isPending}>
                {logScan.isPending ? "Logging…" : "Log that I've seen it here"}
              </Button>
            </>
          )}
        </section>
      )}

      {canLog && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="w-full border border-critical-500/40 py-4 text-lg text-critical-500"
            leftIcon={<Flag className="h-5 w-5" />}
            onClick={() => setReporting(true)}
          >
            Report a problem
          </Button>
          {asset.openWorkOrders > 0 && (
            <p className="text-center text-sm text-gray-400">
              {asset.openWorkOrders === 1
                ? "Biomed has 1 open work order for this device."
                : `Biomed has ${asset.openWorkOrders} open work orders for this device.`}
            </p>
          )}
          <ReportProblemDialog
            open={reporting}
            onOpenChange={setReporting}
            assetId={asset.id}
            equipmentName={asset.equipmentName}
            location={where || asset.location.room || ""}
            alreadyOutOfUse={!asset.safeToUse}
            openWorkOrders={asset.openWorkOrders}
          />
        </>
      )}

      <details open={role ? DETAIL_ROLES.includes(role) : false} className="rounded-2xl border border-white/10 p-4">
        <summary className="cursor-pointer font-medium text-gray-200">More details</summary>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Detail label="Serial number" value={asset.serialNumber} />
          <Detail label="Status" value={humanize(asset.assetStatus)} />
          <Detail label="Category" value={humanize(asset.deviceCategory)} />
          <Detail label="Criticality" value={humanize(asset.criticalityLevel)} />
          <Detail label="Risk class" value={humanize(asset.riskClassification)} />
          <Detail label="Recall" value={asset.recallStatus === "NONE" ? "None" : humanize(asset.recallStatus)} />
          <Detail label="Last maintenance" value={asset.pm.lastPmDate ? formatDate(asset.pm.lastPmDate) : null} />
        </dl>

        <h3 className="mt-6 text-sm font-semibold text-gray-300">Recent work orders</h3>
        {asset.recentMaintenance.length === 0 ? (
          <p className="text-sm text-gray-500">None recorded.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {asset.recentMaintenance.map((m) => (
              <li key={m.id} className="flex justify-between gap-3">
                <span className="text-gray-200">
                  {humanize(m.workOrderType)}
                  {m.description ? ` — ${m.description}` : ""}
                </span>
                <span className="shrink-0 text-gray-400">
                  {humanize(m.workOrderStatus)}, {formatDate(m.completedAt ?? m.scheduledDate, "MMM d")}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-6 text-sm font-semibold text-gray-300">Last seen</h3>
        {asset.recentScans.length === 0 ? (
          <p className="text-sm text-gray-500">No scans yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {asset.recentScans.map((s) => (
              <li key={s.id} className="flex justify-between gap-3">
                <span className="text-gray-200">
                  {s.locationHint || "Location not given"}
                  {s.scannedBy ? ` · ${s.scannedBy}` : ""}
                </span>
                <span className="shrink-0 text-gray-400">{formatDate(s.createdAt, "MMM d, HH:mm")}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}
