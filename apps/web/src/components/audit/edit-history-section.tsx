"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";

import { Button, Skeleton } from "@/components/ui";
import type { AuditChange, AuditEvent } from "@/lib/api/audit";
import { useDeviceHistory } from "@/lib/hooks/use-audit";
import { formatDate } from "@/lib/utils";

const PAGE = 20;

const change = (c: AuditChange) =>
  c.hidden ? `${c.label} changed` : `${c.label}: ${c.from ?? "(blank)"} → ${c.to ?? "(blank)"}`;

function Entry({ e }: { e: AuditEvent }) {
  return (
    <li className="border-l-2 border-white/10 pl-3 text-sm">
      <p className="text-gray-100">{e.summary}</p>
      {e.changes.length > 0 && (
        <ul className="mt-0.5 text-gray-300">
          {e.changes.map((c) => (
            <li key={c.field}>{change(c)}</li>
          ))}
        </ul>
      )}
      {e.reason && <p className="text-gray-300">“{e.reason}”</p>}
      <p className="text-xs text-gray-500">
        {formatDate(e.occurredAt, "MMM d, yyyy HH:mm")} ·{" "}
        {e.actor ? `${e.actor.name} (${e.actorRole})` : "BioTrakr (automatic)"} · entry {e.seq}
      </p>
    </li>
  );
}

/**
 * Everything ever changed about a device and its work orders, checks and
 * files: who, when, what and why. Entries cannot be edited or deleted, and
 * each is chained to the one before by its hash.
 */
export function EditHistorySection({ assetId }: { assetId: string }) {
  const [take, setTake] = useState(PAGE);
  const history = useDeviceHistory(assetId, take);
  const items = history.data?.items ?? [];
  const total = history.data?.total ?? 0;

  return (
    <section aria-labelledby="edit-history-heading" className="rounded-2xl border border-white/10 p-4">
      <h2 id="edit-history-heading" className="flex items-center gap-2 font-medium text-gray-200">
        <ScrollText className="h-4 w-4" aria-hidden="true" /> Edit history
      </h2>
      <p className="mt-1 text-sm text-gray-400">
        Every change to this device and its work orders, checks and files. Entries can&apos;t be edited or deleted.
      </p>
      {history.isPending ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : history.isError ? (
        <p role="alert" className="mt-2 text-sm text-critical-500">
          Couldn&apos;t load the history: {history.error.message}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">Nothing recorded yet.</p>
      ) : (
        <>
          <ol className="mt-3 space-y-3">
            {items.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </ol>
          {items.length < total && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-3"
              onClick={() => setTake(take + PAGE)}
              disabled={history.isFetching}
            >
              {history.isFetching ? "Loading…" : `Show older (${total - items.length} more)`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
