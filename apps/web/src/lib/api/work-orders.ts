import { api } from "./client";

export type WorkOrderStatus =
  | "PENDING"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "AWAITING_PARTS"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

export type WorkOrderView = "open" | "mine" | "done";

export interface WorkOrder {
  id: string;
  workOrderType: string;
  workOrderStatus: WorkOrderStatus;
  isEmergency: boolean;
  scheduledDate: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  description: string | null;
  workPerformed: string | null;
  failureCategory: string | null;
  asset: {
    id: string;
    assetTagNumber: string;
    equipmentName: string;
    assetStatus: string;
    criticalityLevel: string;
    location: string;
  };
  reportedBy: string | null;
  assignedTo: { id: string; name: string } | null;
}

export interface WorkOrderUpdate {
  expectedStatus: WorkOrderStatus;
  status?: WorkOrderStatus;
  assignedTechnicianId?: string;
  workPerformed?: string;
  failureCategory?: string;
  releaseDevice?: boolean;
  confirmSafe?: boolean;
}

export async function reportProblem(body: {
  assetId: string;
  description: string;
  takeOutOfUse: boolean;
  locationHint?: string;
}): Promise<{ workOrderId: string; takenOutOfUse: boolean; outOfUse: boolean }> {
  const { data } = await api.post("/work-orders/problem-reports", body);
  return data;
}

export async function listWorkOrders(params: {
  view: WorkOrderView;
  skip?: number;
  take?: number;
  assetId?: string;
}): Promise<{ total: number; items: WorkOrder[] }> {
  const { data } = await api.get("/work-orders", { params });
  return data;
}

export async function updateWorkOrder(
  id: string,
  body: WorkOrderUpdate,
): Promise<WorkOrder & { deviceReleased: boolean }> {
  const { data } = await api.patch(`/work-orders/${id}`, body);
  return data;
}

export async function listTechnicians(): Promise<Array<{ id: string; name: string }>> {
  const { data } = await api.get("/work-orders/technicians");
  return data;
}
