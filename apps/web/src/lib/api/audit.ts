import { api } from "./client";

/** One field as it read before and after. */
export interface AuditChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
  /** Personal details: only that they changed. */
  hidden?: boolean;
}

export interface AuditEvent {
  id: string;
  /** Its place in the hospital's hash chain. */
  seq: number;
  occurredAt: string;
  /** null: done by BioTrakr itself (the schedule, a device alert). */
  actor: { id: string; name: string } | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  assetId: string | null;
  device: string | null;
  /** For an account: the person's name now. */
  subject: string | null;
  summary: string;
  changes: AuditChange[];
  reason: string | null;
}

export async function listAudit(params: {
  assetId?: string;
  entityType?: string;
  entityId?: string;
  skip?: number;
  take?: number;
}): Promise<{ total: number; items: AuditEvent[] }> {
  const { data } = await api.get("/audit", { params });
  return data;
}
