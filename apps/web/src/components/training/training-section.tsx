"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { Button, Skeleton } from "@/components/ui";
import type { TrainingSession } from "@/lib/api/training";
import { getSession } from "@/lib/auth/session";
import { useTraining } from "@/lib/hooks/use-training";

import { TrainingCard } from "./training-card";
import { TrainingDialog } from "./training-dialog";
import { BIOMED_ROLES, EDITOR_ROLES } from "./training-page";

/** Training that covered this device; biomed engineers can record more. */
export function TrainingSection({
  device,
}: {
  device: { id: string; assetTagNumber: string; equipmentName: string };
}) {
  const role = getSession()?.user.role;
  const canEdit = !!role && EDITOR_ROLES.includes(role);
  const sessions = useTraining(device.id);
  const [dialog, setDialog] = useState<{ session?: TrainingSession } | null>(null);

  return (
    <section aria-labelledby="training-heading" className="rounded-2xl border border-white/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="training-heading" className="flex flex-1 items-center gap-2 font-medium text-gray-200">
          <GraduationCap className="h-4 w-4" aria-hidden="true" /> Training
        </h2>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setDialog({})}>
            Record training…
          </Button>
        )}
      </div>
      {sessions.isPending ? (
        <Skeleton className="mt-3 h-12 w-full" />
      ) : sessions.isError ? (
        <p role="alert" className="mt-2 text-sm text-critical-500">
          Couldn&apos;t load the training: {sessions.error.message}
        </p>
      ) : sessions.data.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          No training recorded on this device.{" "}
          <Link href={"/training" as Route} className="text-primary-400 hover:underline">
            All training
          </Link>
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {sessions.data.map((s) => (
            <TrainingCard
              key={s.id}
              session={s}
              canEdit={canEdit}
              canAttach={!!role && BIOMED_ROLES.includes(role)}
              onEdit={() => setDialog({ session: s })}
            />
          ))}
        </ul>
      )}
      {dialog && (
        <TrainingDialog session={dialog.session} devices={dialog.session ? undefined : [device]} onClose={() => setDialog(null)} />
      )}
    </section>
  );
}
