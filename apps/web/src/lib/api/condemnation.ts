import { api } from "./client";

export type CondemnationStatus = "PROPOSED" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "DISPOSED";
export type DisposalMethod = "E_WASTE_RECYCLER" | "BUYBACK" | "AUCTION" | "TRANSFER" | "OTHER";

/** Must match the API (condemnation/condemnation.ts). */
export const CONDEMNATION_REASONS = {
  beyond_economic_repair: "Beyond economic repair",
  end_of_life: "Past its useful life",
  obsolete: "Obsolete technology",
  no_spares: "Spares or service no longer available",
  unsafe: "Unsafe, and cannot be made safe",
  damaged: "Damaged beyond repair",
  other: "Other",
} as const;
export type CondemnationReason = keyof typeof CONDEMNATION_REASONS;

export const DISPOSAL_LABEL: Record<DisposalMethod, string> = {
  E_WASTE_RECYCLER: "Authorised e-waste recycler",
  BUYBACK: "Buyback against a new purchase",
  AUCTION: "Auction",
  TRANSFER: "Transfer to another institution",
  OTHER: "Other",
};

export interface CondemnationEvidence {
  ageYears: number;
  usefulLifeYears: number;
  purchaseCost: number;
  bookValue: number;
  breakdowns: number;
  downtimeHours: number;
}

export interface Condemnation {
  id: string;
  assetId: string;
  status: CondemnationStatus;
  reasons: CondemnationReason[];
  justification: string;
  repairEstimate: number | null;
  currentValue: number | null;
  /** Repair as a share of the value given, or of the book value, in per cent. */
  repairShare: number | null;
  evidence: CondemnationEvidence;
  proposedById: string;
  proposedBy: string | null;
  proposedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  committee: string | null;
  decisionNote: string | null;
  withdrawnBy: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  disposedBy: string | null;
  disposedAt: string | null;
  disposalMethod: DisposalMethod | null;
  disposalNote: string | null;
  clearance: string | null;
  files: number;
}

export interface CondemnationFile {
  /** The device's record now, for a new proposal. */
  evidence: CondemnationEvidence;
  /** A regulator's clearance this device needs before it leaves. */
  clearance: { kind: "aerb" | "pc-pndt"; text: string } | null;
  condemnations: Condemnation[];
}

export interface ProposeInput {
  assetId: string;
  reasons: CondemnationReason[];
  justification: string;
  repairEstimate?: number;
  currentValue?: number;
}

export interface DecideInput {
  decision: "APPROVED" | "REJECTED";
  committee: string;
  note?: string;
}

export interface DisposeInput {
  method: DisposalMethod;
  disposedOn: string;
  note: string;
  clearance?: string;
}

export async function getCondemnationFile(assetId: string): Promise<CondemnationFile> {
  const { data } = await api.get("/condemnations", { params: { assetId } });
  return data;
}

export async function proposeCondemnation(body: ProposeInput): Promise<Condemnation> {
  const { data } = await api.post("/condemnations", body);
  return data;
}

export async function decideCondemnation(id: string, body: DecideInput): Promise<Condemnation> {
  const { data } = await api.post(`/condemnations/${id}/decision`, body);
  return data;
}

export async function withdrawCondemnation(id: string, reason: string): Promise<Condemnation> {
  const { data } = await api.post(`/condemnations/${id}/withdrawal`, { reason });
  return data;
}

export async function disposeCondemnation(id: string, body: DisposeInput): Promise<Condemnation> {
  const { data } = await api.post(`/condemnations/${id}/disposal`, body);
  return data;
}
