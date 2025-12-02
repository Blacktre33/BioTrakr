import { useQuery } from '@tanstack/react-query';
import {
  getUtilizationSummary,
  getAssetUtilization,
  getCategoryUtilization,
  getDepartmentUtilization,
  getUtilizationTrends,
  getIdleAssets,
  getAssetUtilizationDetails,
  type UtilizationFilters,
} from '@/lib/api/utilization';

/**
 * Hook to fetch overall utilization summary metrics
 */
export function useUtilizationSummary(filters?: UtilizationFilters) {
  return useQuery({
    queryKey: ['utilization', 'summary', filters],
    queryFn: () => getUtilizationSummary(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch utilization metrics per asset
 */
export function useAssetUtilization(filters?: UtilizationFilters) {
  return useQuery({
    queryKey: ['utilization', 'by-asset', filters],
    queryFn: () => getAssetUtilization(filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch utilization metrics by category
 */
export function useCategoryUtilization(filters?: UtilizationFilters) {
  return useQuery({
    queryKey: ['utilization', 'by-category', filters],
    queryFn: () => getCategoryUtilization(filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch utilization metrics by department
 */
export function useDepartmentUtilization(filters?: UtilizationFilters) {
  return useQuery({
    queryKey: ['utilization', 'by-department', filters],
    queryFn: () => getDepartmentUtilization(filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch utilization trends over time
 */
export function useUtilizationTrends(filters?: UtilizationFilters) {
  return useQuery({
    queryKey: ['utilization', 'trends', filters],
    queryFn: () => getUtilizationTrends(filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch idle/underutilized assets
 */
export function useIdleAssets(filters?: UtilizationFilters) {
  return useQuery({
    queryKey: ['utilization', 'idle-assets', filters],
    queryFn: () => getIdleAssets(filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch detailed utilization for a specific asset
 */
export function useAssetUtilizationDetails(assetId: string, filters?: UtilizationFilters) {
  return useQuery({
    queryKey: ['utilization', 'asset', assetId, filters],
    queryFn: () => getAssetUtilizationDetails(assetId, filters),
    enabled: !!assetId,
    staleTime: 5 * 60 * 1000,
  });
}

