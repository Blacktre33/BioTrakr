"use client";

import { useQuery } from "@tanstack/react-query";

import { getAssetFormReference } from "@/lib/api/reference";

/** Dropdown choices for the asset form. Changes rarely, so cache for a while. */
export function useAssetFormReference(enabled = true) {
  return useQuery({
    queryKey: ["reference", "asset-form"],
    queryFn: getAssetFormReference,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
