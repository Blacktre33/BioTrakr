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
  /** Warranty and AMC/CMC cover of devices in service. */
  cover: {
    devices: number;
    covered: number;
    coveredPercent: number | null;
    underWarranty: number;
    underContract: number;
    endingSoonDays: number;
    /** Contracts in force, ending within the window and not renewed. */
    contractsEnding: number;
    warrantiesEnding: number;
    /** What the contracts in force cost a year, together. */
    annualValue: number;
  };
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
  /** Time in use, and breakdowns against their repair limits. */
  uptime: {
    windowDays: number;
    /** Share of time in service the devices were in use. */
    percent: number | null;
    /** NHSRC census: devices working now, of those in service. */
    censusPercent: number | null;
    targetPercent: number;
    breakdowns: number;
    mtbfHours: number | null;
    meanAttendHours: number | null;
    open: {
      total: number;
      nearing: number;
      over: number;
      ageing: { underOneDay: number; oneToThreeDays: number; threeToSevenDays: number; overSevenDays: number };
    };
  };
}

export async function getDashboard(facilityId?: string): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>("/dashboard", {
    params: facilityId ? { facilityId } : undefined,
  });
  return data;
}
