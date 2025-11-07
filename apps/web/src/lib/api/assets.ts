import type { AssetScanLog } from "@medasset/types";

import { api } from "./client";

export interface CreateAssetScanPayload {
  qrPayload: string;
  notes?: string;
  locationHint?: string;
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


