"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listTechnicians,
  listWorkOrders,
  reportProblem,
  updateWorkOrder,
  type WorkOrderUpdate,
  type WorkOrderView,
} from "@/lib/api/work-orders";

export function useWorkOrders(view: WorkOrderView, page = 0, pageSize = 25) {
  return useQuery({
    queryKey: ["work-orders", view, page, pageSize],
    queryFn: () => listWorkOrders({ view, skip: page * pageSize, take: pageSize }),
    // The queue changes as staff report problems; keep it fresh.
    refetchInterval: 60_000,
  });
}

export function useTechnicians(enabled = true) {
  return useQuery({ queryKey: ["technicians"], queryFn: listTechnicians, enabled, staleTime: 5 * 60_000 });
}

/** Anything that can change a device's status refreshes every view of it. */
function useInvalidateDeviceViews() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["asset-lookup"] });
    void queryClient.invalidateQueries({ queryKey: ["asset-status-history"] });
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
  };
}

export function useReportProblemMutation() {
  const invalidate = useInvalidateDeviceViews();
  return useMutation({ mutationFn: reportProblem, onSettled: invalidate });
}

export function useUpdateWorkOrderMutation() {
  const invalidate = useInvalidateDeviceViews();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: WorkOrderUpdate }) => updateWorkOrder(id, body),
    onSettled: invalidate,
  });
}
