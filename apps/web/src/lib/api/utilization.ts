import { api } from './client';

export interface UtilizationSummary {
  averageUtilization: number;
  totalUsageHours: number;
  activeAssetsCount: number;
  totalAssetsCount: number;
  peakUtilizationHour: number;
  peakUtilizationDay: number;
  totalSessions: number;
  averageSessionDuration: number;
}

export interface AssetUtilization {
  assetId: string;
  assetTag: string;
  equipmentName: string;
  category: string;
  utilizationPercentage: number;
  usageHours: number;
  sessionCount: number;
  averageSessionDuration: number;
  lastUsedAt: string | null;
  idleTimeHours: number | null;
  departmentName?: string | null;
}

export interface CategoryUtilization {
  category: string;
  averageUtilization: number;
  totalUsageHours: number;
  assetCount: number;
  sessionCount: number;
}

export interface DepartmentUtilization {
  departmentId: string;
  departmentName: string;
  averageUtilization: number;
  totalUsageHours: number;
  assetCount: number;
  sessionCount: number;
}

export interface UtilizationTrend {
  date: string;
  utilization: number;
  usageHours: number;
  activeAssets: number;
  sessions: number;
}

export interface IdleAsset {
  assetId: string;
  assetTag: string;
  equipmentName: string;
  category: string;
  utilizationPercentage: number;
  daysSinceLastUse: number;
  lastUsedAt: string | null;
  departmentName?: string | null;
}

export interface AssetUtilizationDetails {
  assetId: string;
  assetTag: string;
  equipmentName: string;
  utilizationPercentage: number;
  totalUsageHours: number;
  sessionCount: number;
  averageSessionDuration: number;
  peakUsageHour: number;
  peakUsageDay: number;
  lastUsedAt: string | null;
  trends: UtilizationTrend[];
}

export interface UtilizationFilters {
  startDate?: string;
  endDate?: string;
  category?: string;
  departmentId?: string;
  facilityId?: string;
  granularity?: 'day' | 'week' | 'month';
  maxUtilization?: number;
  minDaysIdle?: number;
}

/**
 * Get overall utilization summary metrics
 */
export async function getUtilizationSummary(filters?: UtilizationFilters): Promise<UtilizationSummary> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.departmentId) params.append('departmentId', filters.departmentId);
  if (filters?.facilityId) params.append('facilityId', filters.facilityId);

  const { data } = await api.get<UtilizationSummary>(`/v1/assets/utilization/summary?${params.toString()}`);
  return data;
}

/**
 * Get utilization metrics per asset
 */
export async function getAssetUtilization(filters?: UtilizationFilters): Promise<AssetUtilization[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.departmentId) params.append('departmentId', filters.departmentId);
  if (filters?.facilityId) params.append('facilityId', filters.facilityId);

  const { data } = await api.get<AssetUtilization[]>(`/v1/assets/utilization/by-asset?${params.toString()}`);
  return data;
}

/**
 * Get utilization metrics by asset category
 */
export async function getCategoryUtilization(filters?: UtilizationFilters): Promise<CategoryUtilization[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.departmentId) params.append('departmentId', filters.departmentId);
  if (filters?.facilityId) params.append('facilityId', filters.facilityId);

  const { data } = await api.get<CategoryUtilization[]>(`/v1/assets/utilization/by-category?${params.toString()}`);
  return data;
}

/**
 * Get utilization metrics by department
 */
export async function getDepartmentUtilization(filters?: UtilizationFilters): Promise<DepartmentUtilization[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.facilityId) params.append('facilityId', filters.facilityId);

  const { data } = await api.get<DepartmentUtilization[]>(`/v1/assets/utilization/by-department?${params.toString()}`);
  return data;
}

/**
 * Get utilization trends over time
 */
export async function getUtilizationTrends(filters?: UtilizationFilters): Promise<UtilizationTrend[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.granularity) params.append('granularity', filters.granularity);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.departmentId) params.append('departmentId', filters.departmentId);
  if (filters?.facilityId) params.append('facilityId', filters.facilityId);

  const { data } = await api.get<UtilizationTrend[]>(`/v1/assets/utilization/trends?${params.toString()}`);
  return data;
}

/**
 * Get assets with low or no utilization
 */
export async function getIdleAssets(filters?: UtilizationFilters): Promise<IdleAsset[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.facilityId) params.append('facilityId', filters.facilityId);
  if (filters?.maxUtilization !== undefined) params.append('maxUtilization', filters.maxUtilization.toString());
  if (filters?.minDaysIdle !== undefined) params.append('minDaysIdle', filters.minDaysIdle.toString());

  const { data } = await api.get<IdleAsset[]>(`/v1/assets/utilization/idle-assets?${params.toString()}`);
  return data;
}

/**
 * Get detailed utilization metrics for a specific asset
 */
export async function getAssetUtilizationDetails(
  assetId: string,
  filters?: UtilizationFilters,
): Promise<AssetUtilizationDetails> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);

  const { data } = await api.get<AssetUtilizationDetails>(
    `/v1/assets/utilization/${assetId}?${params.toString()}`,
  );
  return data;
}

