import { api } from "./client";

export type ItemResult = "PASS" | "FLAG" | "FAIL" | "NA";
export type PmOutcome = "PASS" | "FLAG" | "FAIL";

export interface ChecklistItem {
  key: string;
  text: string;
  kind: "check" | "reading";
  unit?: string;
  min?: number;
  max?: number;
}

export interface Checklist {
  /** "builtin:…" or a hospital checklist's id. */
  key: string;
  name: string;
  keywords: string[];
  items: ChecklistItem[];
  builtIn: boolean;
  /** Offered for new PMs. */
  active: boolean;
}

export interface ChecklistAnswer {
  key: string;
  result?: ItemResult;
  reading?: number;
  note?: string;
}

export interface PmChecklistInput {
  checklistKey: string;
  testEquipment?: string;
  items: ChecklistAnswer[];
}

export interface AnsweredItem extends ChecklistItem {
  result: ItemResult;
  reading: number | null;
  note: string | null;
}

export interface PmRecord {
  id: string;
  workOrderId: string;
  checklistKey: string;
  checklistName: string;
  items: AnsweredItem[];
  outcome: PmOutcome;
  testEquipment: string | null;
  recordedAt: string;
  recordedBy: string;
}

export interface ChecklistInput {
  name: string;
  keywords: string[];
  items: ChecklistItem[];
  active?: boolean;
}

export async function listChecklists(assetId?: string): Promise<{ checklists: Checklist[]; suggested: string | null }> {
  const { data } = await api.get("/pm/checklists", { params: assetId ? { assetId } : undefined });
  return data;
}

export async function saveChecklist(body: ChecklistInput, id?: string): Promise<Checklist> {
  const { data } = id ? await api.patch(`/pm/checklists/${id}`, body) : await api.post("/pm/checklists", body);
  return data;
}

export async function listPmRecords(assetId: string): Promise<PmRecord[]> {
  const { data } = await api.get(`/pm/records/${assetId}`);
  return data;
}
