"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
  importAssetsFromExcel,
  type Asset,
  type CreateAssetPayload,
  type UpdateAssetPayload,
  type ListAssetsParams,
  type ImportResult,
} from "@/lib/api/assets";

/**
 * Hook to fetch a list of assets with optional filters
 */
export function useAssets(params?: ListAssetsParams) {
  return useQuery({
    queryKey: ["assets", params],
    queryFn: () => listAssets(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single asset by ID
 */
export function useAsset(assetId?: string | null) {
  return useQuery({
    queryKey: ["assets", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: Boolean(assetId),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to create a new asset
 */
export function useCreateAssetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAssetPayload) => createAsset(payload),
    onSuccess: () => {
      // Invalidate assets list to refetch
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

/**
 * Hook to update an existing asset
 */
export function useUpdateAssetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, payload }: { assetId: string; payload: UpdateAssetPayload }) =>
      updateAsset(assetId, payload),
    onSuccess: (data: Asset) => {
      // Invalidate both the list and the specific asset
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["assets", data.id] });
    },
  });
}

/**
 * Hook to delete an asset
 */
export function useDeleteAssetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: () => {
      // Invalidate assets list to refetch
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

/**
 * Hook to import assets from Excel file
 */
export function useImportAssetsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => importAssetsFromExcel(file),
    onSuccess: () => {
      // Invalidate assets list to refetch after import
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

