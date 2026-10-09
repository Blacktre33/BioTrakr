"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getDashboard } from "@/lib/api/dashboard";

export function useDashboard(facilityId?: string) {
  return useQuery({
    queryKey: ["dashboard", facilityId ?? "all"],
    queryFn: () => getDashboard(facilityId),
    // Counts move as staff work; a minute is fresh enough for an overview.
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}
