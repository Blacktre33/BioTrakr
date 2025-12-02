"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAssetScan,
  type CreateAssetScanPayload,
  listAssetScans,
  type AssetScanLog
} from "@/lib/api/assets";

export function useAssetScanLogs(assetId?: string | null) {
  return useQuery({
    queryKey: ["asset-scan-logs", assetId],
    queryFn: () => listAssetScans(assetId as string),
    enabled: Boolean(assetId),
  });
}

export function useCreateAssetScanMutation(assetId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { assetId: string; payload: CreateAssetScanPayload }) => {
      const record = await createAssetScan(input.assetId, input.payload);
      return record;
    },
    onSuccess: (_data: AssetScanLog, variables) => {
      // Keep the asset scan history fresh for the newly logged asset.
      queryClient.invalidateQueries({ queryKey: ["asset-scan-logs", variables.assetId] });
    },
    meta: { assetId },
  });
}

