import type { AssetScanLog } from "@medasset/types";

import { api } from "./client";

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

  const { data } = await api.post<ImportResult>("/api/v1/assets/import", formData, {
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
  const { data } = await api.get<Blob>("/api/v1/assets/export", {
    params,
    responseType: "blob",
  });
  return data;
}

/**
 * Download Excel template
 */
export async function downloadAssetTemplate(): Promise<Blob> {
  const { data } = await api.get<Blob>("/api/v1/assets/template", {
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

  const { data } = await api.post<ImportResult>("/api/v1/assets/validate", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return data;
}


