import { api } from "./client";
import type { Session } from "@/lib/auth/session";

export interface RoomNode {
  id: string;
  roomCode: string;
  roomName: string;
  roomType: string | null;
}

export interface FloorNode {
  id: string;
  floorNumber: number;
  floorName: string | null;
  rooms: RoomNode[];
}

export interface BuildingNode {
  id: string;
  buildingCode: string;
  buildingName: string;
  floors: FloorNode[];
}

export interface DepartmentNode {
  id: string;
  departmentCode: string;
  departmentName: string;
  costCenter: string | null;
}

export interface FacilityNode {
  id: string;
  facilityCode: string;
  facilityName: string;
  facilityType: string | null;
  city: string | null;
  timezone: string;
  isActive: boolean;
  departments: DepartmentNode[];
  buildings: BuildingNode[];
}

export interface StaffAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  jobTitle: string | null;
  facilityId: string | null;
  departmentId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  passwordChangeRequired: boolean;
  accountLockedUntil: string | null;
  createdAt: string;
}

/** Locations are added one level at a time; each kind has its own endpoint. */
export type LocationKind = "facilities" | "departments" | "buildings" | "floors" | "rooms";

export async function getLocations(): Promise<FacilityNode[]> {
  const { data } = await api.get<FacilityNode[]>("/admin/locations");
  return data;
}

export async function createLocation(kind: LocationKind, body: Record<string, unknown>): Promise<{ id: string }> {
  const { data } = await api.post<{ id: string }>(`/admin/${kind}`, body);
  return data;
}

export async function updateLocation(
  kind: LocationKind,
  id: string,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const { data } = await api.patch<{ id: string }>(`/admin/${kind}/${id}`, body);
  return data;
}

export async function getStaff(): Promise<StaffAccount[]> {
  const { data } = await api.get<StaffAccount[]>("/admin/users");
  return data;
}

export interface NewStaff {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  jobTitle?: string;
  facilityId?: string;
  departmentId?: string;
}

/** The one-time password is returned only here, once. */
export async function createStaff(body: NewStaff): Promise<{ user: StaffAccount; temporaryPassword: string }> {
  const { data } = await api.post<{ user: StaffAccount; temporaryPassword: string }>("/admin/users", body);
  return data;
}

export async function updateStaff(
  id: string,
  body: Partial<Omit<NewStaff, "email" | "facilityId" | "departmentId">> & {
    facilityId?: string | null;
    departmentId?: string | null;
    isActive?: boolean;
  },
): Promise<StaffAccount> {
  const { data } = await api.patch<StaffAccount>(`/admin/users/${id}`, body);
  return data;
}

export async function resetStaffPassword(id: string): Promise<{ temporaryPassword: string }> {
  const { data } = await api.post<{ temporaryPassword: string }>(`/admin/users/${id}/reset-password`, {});
  return data;
}

/** Returns a fresh sign-in for this device; every other sign-in ends. */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<Session> {
  const { data } = await api.post<Session>("/auth/change-password", { currentPassword, newPassword });
  return data;
}
