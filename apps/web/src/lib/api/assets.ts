import { api } from "./client";

// Define interfaces locally to avoid dependency issues if @biotrakr/types is not fully linked
export interface AssetScanLog {
  id: string;
  assetId: string;
  qrPayload: string;
  notes?: string | null;
  locationHint?: string | null;
  createdAt: Date;
}

export interface CreateAssetScanPayload {
  qrPayload: string;
  notes?: string;
  locationHint?: string;
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
  value?: any;
}

export interface ImportResult {
  success: boolean;
  totalRows: number;
  imported: number;
  failed: number;
  errors: ImportError[];
  warnings?: Array<{
    row: number;
    message: string;
  }>;
}

export async function createAssetScan(
  assetId: string,
  payload: CreateAssetScanPayload,
): Promise<AssetScanLog> {
  const { data } = await api.post<AssetScanLog>(`/assets/${assetId}/scans`, payload);
  return data;
}

export async function listAssetScans(assetId: string): Promise<AssetScanLog[]> {
  const { data } = await api.get<AssetScanLog[]>(`/assets/${assetId}/scans`);
  return data;
}

/**
 * Import assets from Excel file
 */
export async function importAssetsFromExcel(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post<ImportResult>("/v1/assets/import", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return data;
}

/**
 * Export assets to Excel file
 */
export async function exportAssetsToExcel(facilityId?: string): Promise<Blob> {
  const params = facilityId ? { facilityId } : {};
  const { data } = await api.get<Blob>("/v1/assets/export", {
    params,
    responseType: "blob",
  });
  return data;
}

/**
 * Download Excel template
 */
export async function downloadAssetTemplate(): Promise<Blob> {
  const { data } = await api.get<Blob>("/v1/assets/template", {
    responseType: "blob",
  });
  return data;
}

/**
 * Validate Excel file without importing
 */
export async function validateExcelFile(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post<ImportResult>("/v1/assets/validate", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return data;
}

/**
 * Asset interfaces matching backend DTOs
 */
export interface Asset {
  id: string;
  assetTagNumber: string;
  equipmentName: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  deviceCategory: string;
  assetStatus: string;
  criticalityLevel: string;
  riskClassification: string;
  purchaseDate: string;
  purchaseCost: number;
  usefulLifeYears: number;
  organizationId: string;
  currentFacilityId: string;
  primaryCustodianId: string;
  custodianDepartmentId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  currentFacility?: {
    id: string;
    facilityName: string;
  } | null;
  currentRoom?: {
    id: string;
    roomNumber: string;
  } | null;
}

export interface CreateAssetPayload {
  assetTagNumber: string;
  equipmentName: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  deviceCategory: string;
  assetStatus?: string;
  criticalityLevel: string;
  riskClassification: string;
  purchaseDate: string;
  purchaseCost: number;
  usefulLifeYears: number;
  organizationId: string;
  currentFacilityId: string;
  primaryCustodianId: string;
  custodianDepartmentId: string;
  udiDeviceIdentifier?: string;
  amcContractNumber?: string;
  amcStartDate?: string;
  amcEndDate?: string;
  amcCostAnnual?: number;
  amcInitialCost?: number;
  amcYearsPaid?: number;
  amcIncreaseAmount?: number;
  amcIncreasePercentage?: number;
  cmcContractNumber?: string;
  cmcStartDate?: string;
  cmcEndDate?: string;
  cmcCostAnnual?: number;
  cmcInitialCost?: number;
  cmcYearsPaid?: number;
  cmcIncreaseAmount?: number;
  cmcIncreasePercentage?: number;
  notes?: string;
}

export interface UpdateAssetPayload {
  equipmentName?: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  assetStatus?: string;
  currentFacilityId?: string;
  currentRoomId?: string;
  notes?: string;
}

export interface ListAssetsParams {
  skip?: number;
  take?: number;
  search?: string;
  status?: string;
  category?: string;
  facilityId?: string;
}

/**
 * List all assets with optional pagination and filters
 */
export async function listAssets(params?: ListAssetsParams): Promise<Asset[]> {
  const queryParams = new URLSearchParams();
  if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
  if (params?.take !== undefined) queryParams.append('take', params.take.toString());
  
  const { data } = await api.get<Asset[]>(`/assets?${queryParams.toString()}`);
  return data;
}

/**
 * Get a single asset by ID
 */
export async function getAsset(assetId: string): Promise<Asset> {
  const { data } = await api.get<Asset>(`/assets/${assetId}`);
  return data;
}

/**
 * Create a new asset
 */
export async function createAsset(payload: CreateAssetPayload): Promise<Asset> {
  const { data } = await api.post<Asset>('/assets', payload);
  return data;
}

/**
 * Update an existing asset
 */
export async function updateAsset(assetId: string, payload: UpdateAssetPayload): Promise<Asset> {
  const { data } = await api.patch<Asset>(`/assets/${assetId}`, payload);
  return data;
}

/**
 * Delete an asset
 */
export async function deleteAsset(assetId: string): Promise<Asset> {
  const { data } = await api.delete<Asset>(`/assets/${assetId}`);
  return data;
}

