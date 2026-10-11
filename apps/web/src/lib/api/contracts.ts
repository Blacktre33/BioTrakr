import { api } from "./client";

export type ContractType = "AMC" | "CMC";
export type VendorType = "MANUFACTURER" | "DISTRIBUTOR" | "SERVICE_PROVIDER" | "PARTS_SUPPLIER";
export type ContractStatus = "upcoming" | "active" | "expired" | "terminated";
export type ContractFilter = "current" | "ending" | "expired" | "terminated" | "all";

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  AMC: "AMC (labour and PM)",
  CMC: "CMC (parts included)",
};

export const VENDOR_TYPE_LABEL: Record<VendorType, string> = {
  SERVICE_PROVIDER: "Service company",
  MANUFACTURER: "Manufacturer",
  DISTRIBUTOR: "Distributor or dealer",
  PARTS_SUPPLIER: "Parts supplier",
};

/** Contracts ending within this many days are "ending soon" (NHSRC: renew three months ahead). */
export const ENDING_SOON_DAYS = 90;

export interface Vendor {
  id: string;
  vendorName: string;
  vendorType: VendorType;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** How many contracts it has (in the vendor list only). */
  contracts?: number;
}

export interface VendorInput {
  vendorName: string;
  vendorType: VendorType;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface ContractDevice {
  id: string;
  assetTagNumber: string;
  equipmentName: string;
  assetStatus: string;
}

export interface Contract {
  id: string;
  contractType: ContractType;
  contractNumber: string;
  startDate: string;
  endDate: string;
  annualValue: number | null;
  pmVisitsPerYear: number | null;
  responseTimeHours: number | null;
  uptimeGuaranteePercent: number | null;
  notes: string | null;
  renewsId: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  vendor: Vendor;
  devices: ContractDevice[];
  status: ContractStatus;
  /** Days to the last day of cover; negative once passed. */
  daysLeft: number;
  renewedById: string | null;
  previous: { id: string; contractNumber: string; annualValue: number | null } | null;
  /** Earlier years, newest first (detail only). */
  history?: Array<{ id: string; contractNumber: string; startDate: string; endDate: string; annualValue: number | null }>;
}

export interface ContractInput {
  vendorId: string;
  contractType: ContractType;
  contractNumber: string;
  startDate: string;
  endDate: string;
  annualValue?: number;
  pmVisitsPerYear?: number;
  responseTimeHours?: number;
  uptimeGuaranteePercent?: number;
  deviceIds: string[];
  notes?: string;
}

export interface DeviceCover {
  warranty: {
    startDate: string | null;
    endDate: string | null;
    terms: string | null;
    daysLeft: number | null;
    active: boolean;
  };
  contracts: Contract[];
  /** AMC details typed on the device before contracts were records. */
  earlierAmc: { contractNumber: string | null; startDate: string | null; endDate: string | null; annualCost: number | null } | null;
}

/** "ends in 12 days", "ends today", "ended 3 days ago". */
export function describeEnd(daysLeft: number): string {
  if (daysLeft > 1) return `ends in ${daysLeft} days`;
  if (daysLeft === 1) return "ends tomorrow";
  if (daysLeft === 0) return "ends today";
  if (daysLeft === -1) return "ended yesterday";
  return `ended ${-daysLeft} days ago`;
}

/** Change in yearly cost from the contract it renews, e.g. +10%. */
export function costChange(c: Pick<Contract, "annualValue" | "previous">): number | null {
  const before = c.previous?.annualValue;
  if (!before || c.annualValue === null) return null;
  return Math.round(((c.annualValue - before) / before) * 1000) / 10;
}

export async function listContracts(params: { status?: ContractFilter; vendorId?: string } = {}): Promise<Contract[]> {
  const { data } = await api.get<Contract[]>("/contracts", { params });
  return data;
}

export async function getContract(id: string): Promise<Contract> {
  const { data } = await api.get<Contract>(`/contracts/${id}`);
  return data;
}

export async function createContract(body: ContractInput): Promise<Contract> {
  const { data } = await api.post<Contract>("/contracts", body);
  return data;
}

export async function updateContract(id: string, body: ContractInput): Promise<Contract> {
  const { data } = await api.patch<Contract>(`/contracts/${id}`, body);
  return data;
}

export async function renewContract(id: string, body: ContractInput): Promise<Contract> {
  const { data } = await api.post<Contract>(`/contracts/${id}/renewal`, body);
  return data;
}

export async function terminateContract(id: string, reason: string): Promise<Contract> {
  const { data } = await api.post<Contract>(`/contracts/${id}/termination`, { reason });
  return data;
}

export async function getDeviceCover(assetId: string): Promise<DeviceCover> {
  const { data } = await api.get<DeviceCover>(`/assets/${assetId}/cover`);
  return data;
}

export async function listVendors(): Promise<Vendor[]> {
  const { data } = await api.get<Vendor[]>("/vendors");
  return data;
}

export async function createVendor(body: VendorInput): Promise<Vendor> {
  const { data } = await api.post<Vendor>("/vendors", body);
  return data;
}

export async function updateVendor(id: string, body: Partial<VendorInput>): Promise<Vendor> {
  const { data } = await api.patch<Vendor>(`/vendors/${id}`, body);
  return data;
}
