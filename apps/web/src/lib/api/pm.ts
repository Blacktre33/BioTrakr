import { api } from "./client";
import type { WorkOrderStatus } from "./work-orders";

export interface PmDevice {
  id: string;
  assetTagNumber: string;
  equipmentName: string;
  criticalityLevel: string;
  assetStatus: string;
  location: string;
  dueDate: string;
  intervalDays: number;
  /** The open PM work order, if one is open. */
  workOrder: {
    id: string;
    status: WorkOrderStatus;
    scheduledDate: string;
    assignedTo: string | null;
  } | null;
}

export interface PmDone {
  id: string;
  completedAt: string;
  asset: { id: string; assetTagNumber: string; equipmentName: string };
  doneBy: string | null;
}

export interface PmSchedule {
  from: string;
  to: string;
  /** Work orders open automatically this many days before PM is due. */
  leadDays: number;
  due: PmDevice[];
  overdue: { total: number; items: PmDevice[] };
  done: PmDone[];
  truncated: boolean;
}

export async function getPmSchedule(params: { from: Date; to: Date; facilityId?: string }): Promise<PmSchedule> {
  const { data } = await api.get<PmSchedule>("/pm/schedule", {
    params: {
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      ...(params.facilityId ? { facilityId: params.facilityId } : {}),
    },
  });
  return data;
}

export async function openPmWorkOrder(assetId: string): Promise<{ workOrderId: string }> {
  const { data } = await api.post<{ workOrderId: string }>("/pm/work-orders", { assetId });
  return data;
}
