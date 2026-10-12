"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Attachments } from "@/components/documents/attachments";
import { Badge, Button, Card } from "@/components/ui";
import { ASSESSMENT_LABEL, KIND_LABEL, type TrainingSession } from "@/lib/api/training";
import { assessmentText } from "@/lib/training";
import { formatDate } from "@/lib/utils";

/** One session: what, when, by whom, who attended and the papers on file. */
export function TrainingCard({
  session: s,
  canEdit,
  canAttach,
  onEdit,
}: {
  session: TrainingSession;
  canEdit: boolean;
  canAttach: boolean;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <Card className="space-y-1.5 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-100">{formatDate(s.heldOn)}</span>
          <Badge size="sm" variant="primary">
            {KIND_LABEL[s.kind].split(":")[0]}
          </Badge>
          <span className="text-gray-100">{s.equipment}</span>
          {canEdit && (
            <Button size="sm" variant="ghost" className="ml-auto" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
              Correct
            </Button>
          )}
        </div>
        <p className="text-gray-300">{s.topic}</p>
        <p className="text-xs text-gray-400">
          {s.trainer}
          {s.trainerFrom ? `, ${s.trainerFrom}` : ""}
          {s.durationHours !== null ? ` · ${s.durationHours} h` : ""}
          {s.devices.length > 0 ? ` · ${s.devices.map((d) => d.assetTagNumber).join(", ")}` : ""}
        </p>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="text-left text-gray-200 hover:underline"
        >
          {s.attendees.length} attended: {assessmentText(s.attendees)}
        </button>
        {open && (
          <ul className="space-y-0.5 pl-3 text-gray-300">
            {s.attendees.map((a, i) => (
              <li key={i}>
                {a.name}
                {a.designation || a.department ? (
                  <span className="text-gray-500"> · {[a.designation, a.department].filter(Boolean).join(", ")}</span>
                ) : null}
                <span className={a.assessment === "NEEDS_RETRAINING" ? "text-warning-500" : "text-gray-500"}>
                  {" "}
                  · {ASSESSMENT_LABEL[a.assessment]}
                </span>
              </li>
            ))}
          </ul>
        )}
        {s.notes && <p className="text-gray-400">{s.notes}</p>}
        <Attachments
          targetType="training"
          targetId={s.id}
          count={s.files}
          canUpload={canAttach}
          label={{ one: "Attendance sheet", none: "No attendance sheet on file" }}
          defaultTitle={`Attendance sheet, ${formatDate(s.heldOn)}`}
        />
      </Card>
    </li>
  );
}
