"use client";

import type { Route } from "next";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";

import { Badge, Button } from "@/components/ui";
import {
  costChange,
  describeEnd,
  ENDING_SOON_DAYS,
  type Contract,
} from "@/lib/api/contracts";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

/** Shown with the status: what someone checking cover needs to know first. */
export function statusBadge(c: Pick<Contract, "status" | "daysLeft" | "renewedById" | "startDate">): {
  label: string;
  variant: "success" | "warning" | "critical" | "neutral" | "primary";
} {
  switch (c.status) {
    case "terminated":
      return { label: "Ended early", variant: "neutral" };
    case "upcoming":
      return { label: `Starts ${formatDate(c.startDate)}`, variant: "primary" };
    case "expired":
      return c.renewedById
        ? { label: "Renewed", variant: "neutral" }
        : { label: `Expired, ${describeEnd(c.daysLeft).replace("ended ", "")}`, variant: "critical" };
    default:
      if (c.renewedById) return { label: "In force, renewal arranged", variant: "success" };
      if (c.daysLeft <= 30) return { label: `In force, ${describeEnd(c.daysLeft)}`, variant: "critical" };
      if (c.daysLeft <= ENDING_SOON_DAYS) return { label: `In force, ${describeEnd(c.daysLeft)}`, variant: "warning" };
      return { label: "In force", variant: "success" };
  }
}

const SHOWN_DEVICES = 6;

/** One contract: vendor to call, period, cost, devices, and what biomed can do with it. */
export function ContractCard({
  contract: c,
  highlighted,
  actions,
}: {
  contract: Contract;
  highlighted?: boolean;
  actions?: { onEdit: () => void; onRenew: () => void; onTerminate: () => void } | null;
}) {
  const badge = statusBadge(c);
  const change = costChange(c);
  const more = c.devices.length - SHOWN_DEVICES;
  const live = c.status === "active" || c.status === "upcoming";

  return (
    <li
      id={`contract-${c.id}`}
      className={cn(
        "rounded-2xl border p-4",
        highlighted ? "border-primary-500/60 bg-primary-500/5" : "border-white/10",
        !live && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-white">{c.vendor.vendorName}</h3>
        <Badge size="sm" variant="accent">
          {c.contractType}
        </Badge>
        <Badge size="sm" variant={badge.variant}>
          {badge.label}
        </Badge>
        <span className="ml-auto font-mono text-xs text-gray-400">{c.contractNumber}</span>
      </div>

      <p className="mt-1 text-sm text-gray-300">
        {formatDate(c.startDate)} to {formatDate(c.endDate)}
        {c.annualValue !== null && (
          <>
            {" · "}
            {formatCurrency(c.annualValue)} a year
            {change !== null && change !== 0 && (
              <span className={change > 0 ? "text-warning-500" : "text-success-500"}>
                {" "}
                ({change > 0 ? "+" : ""}
                {change}% on the year before)
              </span>
            )}
          </>
        )}
        {c.responseTimeHours !== null && ` · attends within ${c.responseTimeHours} h`}
        {c.pmVisitsPerYear !== null && ` · ${c.pmVisitsPerYear} PM visits a year`}
        {c.uptimeGuaranteePercent !== null && ` · ${c.uptimeGuaranteePercent}% uptime`}
      </p>

      {(c.vendor.contactPerson || c.vendor.phone || c.vendor.email) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-300">
          {c.vendor.contactPerson && <span>{c.vendor.contactPerson}</span>}
          {c.vendor.phone && (
            <a href={`tel:${c.vendor.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 text-primary-400 hover:underline">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {c.vendor.phone}
            </a>
          )}
          {c.vendor.email && (
            <a href={`mailto:${c.vendor.email}`} className="flex items-center gap-1 text-primary-400 hover:underline">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {c.vendor.email}
            </a>
          )}
        </p>
      )}

      <p className="mt-2 text-sm text-gray-400">
        {c.devices.length === 1 ? "1 device: " : `${c.devices.length} devices: `}
        {c.devices.slice(0, SHOWN_DEVICES).map((d, i) => (
          <span key={d.id}>
            {i > 0 && ", "}
            <Link href={`/assets/${d.id}` as Route} className="text-gray-200 hover:underline">
              {d.equipmentName}
            </Link>{" "}
            <span className="font-mono text-xs">{d.assetTagNumber}</span>
          </span>
        ))}
        {more > 0 && ` and ${more} more`}
      </p>

      {c.notes && <p className="mt-1 whitespace-pre-line text-sm text-gray-400">{c.notes}</p>}
      {c.terminationReason && <p className="mt-1 text-sm text-gray-400">Ended early: {c.terminationReason}</p>}

      {actions && (
        <div className="mt-3 flex flex-wrap gap-2">
          {c.status !== "terminated" && (
            <Button size="sm" variant="ghost" onClick={actions.onEdit}>
              Edit
            </Button>
          )}
          {!c.renewedById && c.status !== "terminated" && (
            <Button size="sm" variant="secondary" onClick={actions.onRenew}>
              Renew
            </Button>
          )}
          {live && (
            <Button size="sm" variant="ghost" onClick={actions.onTerminate}>
              End early…
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
