"use client";

import { useState } from "react";
import { Archive } from "lucide-react";

import { Attachments } from "@/components/documents/attachments";
import { Badge, Button, Skeleton } from "@/components/ui";
import {
  CONDEMNATION_REASONS,
  DISPOSAL_LABEL,
  type Condemnation,
  type CondemnationStatus,
} from "@/lib/api/condemnation";
import { getSession } from "@/lib/auth/session";
import { evidenceText } from "@/lib/condemnation";
import { useCondemnationFile } from "@/lib/hooks/use-condemnation";
import { formatCurrency, formatDate } from "@/lib/utils";

import { DecideDialog, DisposeDialog, ProposeDialog, WithdrawDialog } from "./condemnation-dialogs";

/** Must match the API's ASSET_EDITOR_ROLES and BIOMED_ROLES (auth/roles.ts). */
const EDITOR_ROLES = ["admin", "engineer"];
const BIOMED_ROLES = ["admin", "engineer", "technician"];

const STATUS: Record<CondemnationStatus, { label: string; variant: "warning" | "critical" | "neutral" }> = {
  PROPOSED: { label: "Waiting for the committee", variant: "warning" },
  APPROVED: { label: "Condemned, waiting for disposal", variant: "critical" },
  REJECTED: { label: "Not approved", variant: "neutral" },
  WITHDRAWN: { label: "Withdrawn", variant: "neutral" },
  DISPOSED: { label: "Disposed of", variant: "neutral" },
};

type Open = { kind: "decide" | "withdraw" | "dispose"; c: Condemnation };

function Proposal({
  c,
  role,
  me,
  onOpen,
}: {
  c: Condemnation;
  role: string | undefined;
  me: string | undefined;
  onOpen: (o: Open) => void;
}) {
  const admin = role === "admin";
  const canEdit = !!role && EDITOR_ROLES.includes(role);
  const value = c.currentValue ?? c.evidence.bookValue;
  return (
    <li className="space-y-1 border-l-2 border-white/10 pl-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS[c.status].variant} size="sm">
          {STATUS[c.status].label}
        </Badge>
        <span className="text-gray-100">{c.reasons.map((r) => CONDEMNATION_REASONS[r] ?? r).join("; ")}</span>
      </div>
      <p className="whitespace-pre-line text-gray-300">{c.justification}</p>
      <p className="text-xs text-gray-400">When proposed: {evidenceText(c.evidence)}</p>
      {c.repairEstimate !== null && (
        <p className="text-gray-300">
          Repair estimate {formatCurrency(c.repairEstimate)}
          {c.repairShare !== null && `, ${c.repairShare}% of its value (${formatCurrency(value)})`}
        </p>
      )}
      <p className="text-xs text-gray-500">
        Proposed {formatDate(c.proposedAt)} by {c.proposedBy ?? "someone"}
      </p>
      {c.decidedAt && (
        <p className="text-gray-300">
          {c.status === "REJECTED" ? "Not approved" : "Approved"} {formatDate(c.decidedAt)} by {c.decidedBy}:{" "}
          {c.committee}
          {c.decisionNote && <span className="block text-gray-400">{c.decisionNote}</span>}
        </p>
      )}
      {c.withdrawnAt && (
        <p className="text-warning-500">
          {c.decidedAt && c.status === "WITHDRAWN" ? "Reversed" : "Withdrawn"} {formatDate(c.withdrawnAt)} by{" "}
          {c.withdrawnBy}: {c.withdrawalReason}
        </p>
      )}
      {c.disposedAt && c.disposalMethod && (
        <p className="text-gray-300">
          Disposed of {formatDate(c.disposedAt)}: {DISPOSAL_LABEL[c.disposalMethod]}. {c.disposalNote}
          {c.clearance && <span className="block text-gray-400">Clearance: {c.clearance}</span>}
        </p>
      )}
      <Attachments
        targetType="condemnation"
        targetId={c.id}
        count={c.files}
        canUpload={!!role && BIOMED_ROLES.includes(role)}
        label={{ one: "Paper", none: "No papers on file" }}
        defaultTitle={c.status === "PROPOSED" ? "Committee minutes" : "Disposal certificate"}
      />
      <div className="flex flex-wrap gap-2 pt-1">
        {c.status === "PROPOSED" && admin && c.proposedById !== me && (
          <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: "decide", c })}>
            Record the committee&apos;s decision…
          </Button>
        )}
        {c.status === "APPROVED" && canEdit && (
          <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: "dispose", c })}>
            Record the disposal…
          </Button>
        )}
        {((c.status === "PROPOSED" && (admin || c.proposedById === me)) || (c.status === "APPROVED" && admin)) && (
          <Button size="sm" variant="ghost" onClick={() => onOpen({ kind: "withdraw", c })}>
            {c.status === "APPROVED" ? "Reverse…" : "Withdraw…"}
          </Button>
        )}
      </div>
      {c.status === "PROPOSED" && admin && c.proposedById === me && (
        <p className="text-xs text-gray-500">Another administrator records the committee&apos;s decision.</p>
      )}
    </li>
  );
}

/**
 * The device's condemnation file: the proposal with its evidence, the
 * committee's decision, the disposal, and the papers for each.
 */
export function CondemnationSection({
  assetId,
  equipmentName,
  assetStatus,
}: {
  assetId: string;
  equipmentName: string;
  assetStatus: string;
}) {
  const session = getSession();
  const role = session?.user.role;
  const me = session?.user.id;
  const file = useCondemnationFile(assetId);
  const [proposing, setProposing] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);

  const data = file.data;
  const pending = data?.condemnations.some((c) => c.status === "PROPOSED" || c.status === "APPROVED");
  const canPropose = !!role && EDITOR_ROLES.includes(role) && !pending && assetStatus !== "DISPOSED";

  return (
    <section aria-labelledby="condemnation-heading" className="rounded-2xl border border-white/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="condemnation-heading" className="flex flex-1 items-center gap-2 font-medium text-gray-200">
          <Archive className="h-4 w-4" aria-hidden="true" /> Condemnation
        </h2>
        {canPropose && data && (
          <Button size="sm" variant="ghost" onClick={() => setProposing(true)}>
            Propose for condemnation…
          </Button>
        )}
      </div>
      {file.isPending ? (
        <Skeleton className="mt-3 h-12 w-full" />
      ) : file.isError ? (
        <p role="alert" className="mt-2 text-sm text-critical-500">
          Couldn&apos;t load the condemnation file: {file.error.message}
        </p>
      ) : (
        <>
          {file.data.condemnations.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Not proposed for condemnation.</p>
          ) : (
            <ol className="mt-3 space-y-4">
              {file.data.condemnations.map((c) => (
                <Proposal key={c.id} c={c} role={role} me={me} onOpen={setOpen} />
              ))}
            </ol>
          )}
          {file.data.clearance && pending && <p className="mt-3 text-sm text-warning-500">{file.data.clearance.text}</p>}
        </>
      )}
      {proposing && data && (
        <ProposeDialog
          assetId={assetId}
          equipmentName={equipmentName}
          evidence={data.evidence}
          onClose={() => setProposing(false)}
        />
      )}
      {open?.kind === "decide" && (
        <DecideDialog c={open.c} equipmentName={equipmentName} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "withdraw" && <WithdrawDialog c={open.c} onClose={() => setOpen(null)} />}
      {open?.kind === "dispose" && (
        <DisposeDialog
          c={open.c}
          equipmentName={equipmentName}
          clearance={data?.clearance ?? null}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
