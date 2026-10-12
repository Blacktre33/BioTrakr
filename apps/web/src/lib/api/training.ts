import { api } from "./client";

export type TrainingKind = "OPERATOR" | "MAINTENANCE" | "REFRESHER" | "INDUCTION";
export type TrainingAssessment = "PASSED" | "NEEDS_RETRAINING" | "NOT_ASSESSED";

export const KIND_LABEL: Record<TrainingKind, string> = {
  OPERATOR: "Operator: using it on patients",
  MAINTENANCE: "Maintenance: biomed",
  REFRESHER: "Refresher",
  INDUCTION: "Induction for new staff",
};

export const ASSESSMENT_LABEL: Record<TrainingAssessment, string> = {
  PASSED: "Passed",
  NEEDS_RETRAINING: "Needs retraining",
  NOT_ASSESSED: "Not assessed",
};

export interface Attendee {
  name: string;
  designation: string | null;
  department: string | null;
  assessment: TrainingAssessment;
}

export interface TrainingSession {
  id: string;
  heldOn: string;
  kind: TrainingKind;
  topic: string;
  equipment: string;
  trainer: string;
  trainerFrom: string | null;
  durationHours: number | null;
  notes: string | null;
  recordedAt: string;
  recordedBy: string;
  devices: Array<{ id: string; assetTagNumber: string; equipmentName: string }>;
  attendees: Attendee[];
  /** Files on record (not withdrawn): the attendance sheet, certificates. */
  files: number;
}

export interface TrainingInput {
  heldOn: string;
  kind: TrainingKind;
  topic: string;
  equipment: string;
  trainer: string;
  trainerFrom?: string;
  durationHours?: number;
  notes?: string;
  deviceIds: string[];
  attendees: Array<{ name: string; designation?: string; department?: string; assessment: TrainingAssessment }>;
}

export async function listTraining(assetId?: string): Promise<TrainingSession[]> {
  const { data } = await api.get<TrainingSession[]>("/training", { params: assetId ? { assetId } : undefined });
  return data;
}

export async function saveTraining(body: TrainingInput, id?: string): Promise<TrainingSession> {
  const { data } = id ? await api.patch(`/training/${id}`, body) : await api.post("/training", body);
  return data;
}
