"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileText, Mail, Phone, Plus } from "lucide-react";
import { toast } from "sonner";

import { ERROR_BORDER, Field, describedBy } from "@/components/forms/form-field";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { VENDOR_TYPE_LABEL, type Contract, type ContractFilter, type Vendor } from "@/lib/api/contracts";
import { getSession } from "@/lib/auth/session";
import { useContracts, useTerminateContract, useVendors } from "@/lib/hooks/use-contracts";
import { cn } from "@/lib/utils";

import { ContractCard } from "./contract-card";
import { ContractDialog } from "./contract-dialog";
import { VendorDialog } from "./vendor-dialog";

/** Must match the API's ASSET_EDITOR_ROLES: who may add and change contracts. */
const EDITOR_ROLES = ["admin", "engineer"];

const FILTERS: Array<{ id: ContractFilter; label: string }> = [
  { id: "current", label: "In force" },
  { id: "ending", label: "Ending in 90 days" },
  { id: "expired", label: "Expired" },
  { id: "terminated", label: "Ended early" },
  { id: "all", label: "All" },
];

const EMPTY: Record<ContractFilter, string> = {
  current: "No contracts in force.",
  ending: "No contract ends in the next 90 days without a renewal.",
  expired: "No expired contracts.",
  terminated: "No contract has been ended early.",
  all: "No contracts yet.",
};

function TerminateDialog({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const terminate = useTerminateContract();
  const error = submitted && reason.trim().length < 5 ? "Say why the contract ends early" : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (reason.trim().length < 5) return;
    try {
      await terminate.mutateAsync({ id: contract.id, reason: reason.trim() });
      toast.success(`${contract.contractNumber} ended early`);
      onClose();
    } catch (err) {
      setServerError((err as Error).message || "Could not save. Please try again.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>End contract early</DialogTitle>
          <DialogDescription>
            {contract.contractType} {contract.contractNumber} with {contract.vendor.vendorName}. It stays on record with
            the reason; its devices are no longer covered.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field field="terminate-reason" label="Why?" required error={error}>
            <Textarea
              {...describedBy("terminate-reason", error)}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Vendor stopped servicing this model"
              className={cn(error && ERROR_BORDER)}
            />
          </Field>
          {serverError && (
            <p role="alert" className="text-sm text-critical-500">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={terminate.isPending}>
              Back
            </Button>
            <Button type="submit" variant="danger" disabled={terminate.isPending}>
              {terminate.isPending ? "Saving…" : "End contract"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContractList({ canEdit }: { canEdit: boolean }) {
  const params = useSearchParams();
  // A notice links here with ?id=: show every contract so it is in the list.
  const linkedId = params.get("id");
  const [filter, setFilter] = useState<ContractFilter>(linkedId ? "all" : "current");
  const contracts = useContracts(filter);
  const [dialog, setDialog] = useState<
    { kind: "create" } | { kind: "edit" | "renew" | "terminate"; contract: Contract } | null
  >(null);

  useEffect(() => {
    if (linkedId && contracts.data) {
      document.getElementById(`contract-${linkedId}`)?.scrollIntoView({ block: "center" });
    }
  }, [linkedId, contracts.data]);

  return (
    <section aria-labelledby="contracts-heading" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="contracts-heading" className="sr-only">
          Contracts
        </h2>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-sm",
                filter === f.id ? "bg-primary-500/20 text-white" : "text-gray-400 hover:text-gray-200",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {canEdit && (
          <Button className="ml-auto" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setDialog({ kind: "create" })}>
            New contract
          </Button>
        )}
      </div>

      {contracts.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : contracts.isError ? (
        <p role="alert" className="text-critical-500">
          Couldn&apos;t load contracts: {contracts.error.message}
        </p>
      ) : contracts.data.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={EMPTY[filter]}
          description={
            filter === "current" && canEdit
              ? "Add your AMC and CMC contracts to get reminders before they end."
              : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {contracts.data.map((c) => (
            <ContractCard
              key={c.id}
              contract={c}
              highlighted={c.id === linkedId}
              canAttach={canEdit}
              actions={
                canEdit
                  ? {
                      onEdit: () => setDialog({ kind: "edit", contract: c }),
                      onRenew: () => setDialog({ kind: "renew", contract: c }),
                      onTerminate: () => setDialog({ kind: "terminate", contract: c }),
                    }
                  : null
              }
            />
          ))}
        </ul>
      )}

      {dialog?.kind === "create" && <ContractDialog mode="create" onClose={() => setDialog(null)} />}
      {(dialog?.kind === "edit" || dialog?.kind === "renew") && (
        <ContractDialog mode={dialog.kind} contract={dialog.contract} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "terminate" && <TerminateDialog contract={dialog.contract} onClose={() => setDialog(null)} />}
    </section>
  );
}

function VendorList({ canEdit }: { canEdit: boolean }) {
  const vendors = useVendors();
  const [editing, setEditing] = useState<Vendor | null | "new">(null);

  return (
    <section aria-labelledby="vendors-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 id="vendors-heading" className="sr-only">
          Vendors
        </h2>
        {canEdit && (
          <Button className="ml-auto" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
            New vendor
          </Button>
        )}
      </div>
      {vendors.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : vendors.isError ? (
        <p role="alert" className="text-critical-500">
          Couldn&apos;t load vendors: {vendors.error.message}
        </p>
      ) : vendors.data.length === 0 ? (
        <EmptyState icon={<FileText className="h-8 w-8" />} title="No vendors yet." />
      ) : (
        <ul className="divide-y divide-white/5 rounded-2xl border border-white/10">
          {vendors.data.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
              <div className="min-w-[12rem]">
                <p className="font-medium text-white">{v.vendorName}</p>
                <p className="text-gray-400">
                  {VENDOR_TYPE_LABEL[v.vendorType]} · {v.contracts === 1 ? "1 contract" : `${v.contracts ?? 0} contracts`}
                </p>
              </div>
              {v.contactPerson && <span className="text-gray-300">{v.contactPerson}</span>}
              {v.phone && (
                <a href={`tel:${v.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 text-primary-400 hover:underline">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {v.phone}
                </a>
              )}
              {v.email && (
                <a href={`mailto:${v.email}`} className="flex items-center gap-1 text-primary-400 hover:underline">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {v.email}
                </a>
              )}
              {canEdit && (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(v)}>
                  Edit
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <VendorDialog vendor={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** AMC/CMC contracts and the vendors behind them. */
export function ContractsPage() {
  const [tab, setTab] = useState<"contracts" | "vendors">("contracts");
  const [canEdit, setCanEdit] = useState(false);
  // The session lives in sessionStorage: read it after mount.
  useEffect(() => setCanEdit(EDITOR_ROLES.includes(getSession()?.user.role ?? "")), []);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div role="tablist" aria-label="Contracts pages" className="flex gap-2">
        {(["contracts", "vendors"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm",
              tab === t ? "bg-primary-500/20 text-white" : "text-gray-400 hover:text-gray-200",
            )}
          >
            {t === "contracts" ? "Contracts" : "Vendors"}
          </button>
        ))}
      </div>
      {tab === "contracts" ? <ContractList canEdit={canEdit} /> : <VendorList canEdit={canEdit} />}
    </div>
  );
}
