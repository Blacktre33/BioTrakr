"use client";

import { useQuery } from "@tanstack/react-query";

import { lookupAsset } from "@/lib/api/assets";

export function useAssetLookup(code: string | null) {
  return useQuery({
    queryKey: ["asset-lookup", code],
    queryFn: () => lookupAsset(code!),
    enabled: Boolean(code),
    // "Not found" and "bad code" answers will not change on a retry.
    retry: (failureCount, error) =>
      failureCount < 1 && ![400, 404].includes((error as { statusCode?: number }).statusCode ?? 0),
    staleTime: 15 * 1000,
  });
}
