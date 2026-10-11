import { api } from "./client";

export type DeviceStatus =
  | "ACTIVE"
  | "IN_SERVICE"
  | "IN_MAINTENANCE"
  | "QUARANTINED"
  | "CONDEMNED"
  | "RETIRED"
  | "DISPOSED";

export interface DashboardSummary {
  generatedAt: string;
  devices: {
    /** In inventory: everything but retired, condemned and disposed. */
    total: number;
    inUse: number;
    outOfUse: number;
    byStatus: Record<DeviceStatus, number>;
    outOfUseList: Array<{
      id: string;
      assetTagNumber: string;
      equipmentName: string;
      assetStatus: DeviceStatus;
      criticalityLevel: string;
      location: string;
      since: string | null;
    }>;
  };
  pm: {
    scheduled: number;
    overdue: number;
    dueSoon: number;
    dueSoonDays: number;
    notScheduled: number;
    compliancePercent: number | null;
    overdueList: Array<{
      id: string;
      assetTagNumber: string;
      equipmentName: string;
      criticalityLevel: string;
      location: string;
      nextPmDueDate: string;
      daysOverdue: number;
      openWorkOrder: { id: string; workOrderStatus: string } | null;
    }>;
  };
  calibration: {
    scheduled: number;
    overdue: number;
    dueSoon: number;
    dueSoonDays: number;
    /** In the calibration programme but with no due date. */
    notScheduled: number;
    /** Failed their latest calibration (kept out of use). */
    failed: number;
    compliancePercent: number | null;
  };
  /** Electrical safety tests (IS/IEC 62353), counted the same way. */
  safetyTests: DashboardSummary["calibration"];
  workOrders: {
    open: number;
    urgent: number;
    unassigned: number;
    awaitingParts: number;
    weekly: Array<{ weekStart: string; opened: number; completed: number }>;
  };
  repairs: {
    windowDays: number;
    completed: number;
    meanHours: number | null;
    medianHours: number | null;
  };
}

export async function getDashboard(facilityId?: string): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>("/dashboard", {
    params: facilityId ? { facilityId } : undefined,
  });
  return data;
}
