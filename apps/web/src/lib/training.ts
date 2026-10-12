import type { PickedDevice } from "@/components/contracts/device-picker";
import type { TrainingAssessment, TrainingInput, TrainingKind, TrainingSession } from "@/lib/api/training";

export interface AttendeeRow {
  /** Keeps React's rows stable as people are added and removed. */
  rowId: number;
  name: string;
  designation: string;
  department: string;
  assessment: TrainingAssessment;
}

export interface TrainingValues {
  heldOn: string;
  kind: TrainingKind;
  topic: string;
  equipment: string;
  trainer: string;
  trainerFrom: string;
  hours: string;
  notes: string;
  devices: PickedDevice[];
  attendees: AttendeeRow[];
}

let next = 1;
export const blankAttendee = (): AttendeeRow => ({
  rowId: next++,
  name: "",
  designation: "",
  department: "",
  assessment: "PASSED",
});

const isBlank = (a: AttendeeRow) => !a.name.trim() && !a.designation.trim() && !a.department.trim();

/** Today here, as the date input wants it. */
export const todayValue = () => new Date().toLocaleDateString("en-CA");

export function emptyTraining(devices: PickedDevice[] = []): TrainingValues {
  return {
    heldOn: todayValue(),
    kind: "OPERATOR",
    topic: "",
    equipment: devices[0]?.equipmentName ?? "",
    trainer: "",
    trainerFrom: "",
    hours: "",
    notes: "",
    devices,
    attendees: [blankAttendee()],
  };
}

export function valuesFrom(s: TrainingSession): TrainingValues {
  return {
    heldOn: new Date(s.heldOn).toLocaleDateString("en-CA"),
    kind: s.kind,
    topic: s.topic,
    equipment: s.equipment,
    trainer: s.trainer,
    trainerFrom: s.trainerFrom ?? "",
    hours: s.durationHours === null ? "" : String(s.durationHours),
    notes: s.notes ?? "",
    devices: s.devices,
    attendees: s.attendees.map((a) => ({
      rowId: next++,
      name: a.name,
      designation: a.designation ?? "",
      department: a.department ?? "",
      assessment: a.assessment,
    })),
  };
}

export type TrainingErrors = Partial<Record<"heldOn" | "topic" | "equipment" | "trainer" | "hours" | "attendees", string>>;

/** The same checks the API makes; rows left empty are ignored. */
export function trainingErrors(v: TrainingValues): TrainingErrors {
  const e: TrainingErrors = {};
  if (!v.heldOn) e.heldOn = "Enter the date of the training";
  else if (v.heldOn > todayValue()) e.heldOn = "The training date is in the future";
  if (v.topic.trim().length < 3) e.topic = "Say what the training covered";
  if (v.equipment.trim().length < 2) e.equipment = "Name the equipment";
  if (v.trainer.trim().length < 2) e.trainer = "Name the trainer";
  if (v.hours.trim()) {
    const h = Number(v.hours);
    if (!Number.isFinite(h) || h < 0.1 || h > 99 || Math.round(h * 10) !== h * 10) e.hours = "Enter the hours, e.g. 1.5";
  }
  const people = v.attendees.filter((a) => !isBlank(a));
  if (people.length === 0) e.attendees = "Add at least one attendee";
  else if (people.some((a) => a.name.trim().length < 2)) e.attendees = "Give each attendee's name";
  return e;
}

export function toTrainingInput(v: TrainingValues): TrainingInput {
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  return {
    heldOn: v.heldOn,
    kind: v.kind,
    topic: v.topic.trim(),
    equipment: v.equipment.trim(),
    trainer: v.trainer.trim(),
    ...(opt(v.trainerFrom) ? { trainerFrom: opt(v.trainerFrom) } : {}),
    ...(v.hours.trim() ? { durationHours: Number(v.hours) } : {}),
    ...(opt(v.notes) ? { notes: opt(v.notes) } : {}),
    deviceIds: v.devices.map((d) => d.id),
    attendees: v.attendees
      .filter((a) => !isBlank(a))
      .map((a) => ({
        name: a.name.trim(),
        ...(opt(a.designation) ? { designation: opt(a.designation) } : {}),
        ...(opt(a.department) ? { department: opt(a.department) } : {}),
        assessment: a.assessment,
      })),
  };
}

/** "10 passed, 1 needs retraining" (as the API words it). */
export function assessmentText(attendees: Array<{ assessment: TrainingAssessment }>): string {
  const count = (a: TrainingAssessment) => attendees.filter((x) => x.assessment === a).length;
  const [passed, retrain, none] = [count("PASSED"), count("NEEDS_RETRAINING"), count("NOT_ASSESSED")];
  return [
    passed ? `${passed} passed` : null,
    retrain ? `${retrain} ${retrain === 1 ? "needs" : "need"} retraining` : null,
    none ? `${none} not assessed` : null,
  ]
    .filter(Boolean)
    .join(", ");
}
