"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getPmSchedule, openPmWorkOrder } from "@/lib/api/pm";

export function usePmSchedule(from: Date, to: Date, facilityId?: string) {
  return useQuery({
    queryKey: ["pm-schedule", from.toISOString(), to.toISOString(), facilityId ?? "all"],
    queryFn: () => getPmSchedule({ from, to, facilityId }),
    refetchInterval: 5 * 60_000,
    // Paging months keeps the last one on screen until the next arrives.
    placeholderData: keepPreviousData,
  });
}

export function useOpenPmWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: openPmWorkOrder,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["pm-schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
