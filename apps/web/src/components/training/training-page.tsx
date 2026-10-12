"use client";

import { useState } from "react";
import { GraduationCap, Plus } from "lucide-react";

import { Button, EmptyState, Skeleton } from "@/components/ui";
import type { TrainingSession } from "@/lib/api/training";
import { getSession } from "@/lib/auth/session";
import { useTraining } from "@/lib/hooks/use-training";

import { TrainingCard } from "./training-card";
import { TrainingDialog } from "./training-dialog";

/** Must match the API's ASSET_EDITOR_ROLES and BIOMED_ROLES (auth/roles.ts). */
export const EDITOR_ROLES = ["admin", "engineer"];
export const BIOMED_ROLES = ["admin", "engineer", "technician"];

/** Every training session on medical equipment, newest first. */
export function TrainingPage() {
  const role = getSession()?.user.role;
  const canEdit = !!role && EDITOR_ROLES.includes(role);
  const sessions = useTraining();
  const [dialog, setDialog] = useState<{ session?: TrainingSession } | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-gray-400">
          NABH asks that the people who use and maintain medical equipment are trained on it. Record each session with
          the attendance sheet; the training register prints them for any period.
        </p>
        {canEdit && (
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setDialog({})}>
            Record training
          </Button>
        )}
      </div>
      {sessions.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : sessions.isError ? (
        <p role="alert" className="text-critical-500">
          Couldn&apos;t load the training: {sessions.error.message}
        </p>
      ) : sessions.data.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-8 w-8" />} title="No training recorded yet." />
      ) : (
        <ul className="space-y-3">
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
      {dialog && <TrainingDialog session={dialog.session} onClose={() => setDialog(null)} />}
    </div>
  );
}
