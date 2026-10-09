"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { changeAssetStatus, getStatusHistory } from "@/lib/api/assets";

export function useStatusHistory(assetId: string) {
  return useQuery({
    queryKey: ["asset-status-history", assetId],
    queryFn: () => getStatusHistory(assetId),
  });
}

export function useChangeAssetStatusMutation(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: string; reason: string; expectedStatus?: string }) =>
      changeAssetStatus(assetId, body),
    onSettled: () => {
      // Status drives the safety banner everywhere; refetch all views of it.
      void queryClient.invalidateQueries({ queryKey: ["asset-lookup"] });
      void queryClient.invalidateQueries({ queryKey: ["asset-status-history", assetId] });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}
