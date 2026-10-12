"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listChecklists, listPmRecords, saveChecklist, type ChecklistInput } from "@/lib/api/checklists";

/** Every checklist, and the one that suits a device when given. */
export function useChecklists(assetId?: string, enabled = true) {
  return useQuery({
    queryKey: ["pm-checklists", assetId ?? null],
    queryFn: () => listChecklists(assetId),
    enabled,
  });
}

export function useSaveChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: ChecklistInput }) => saveChecklist(body, id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["pm-checklists"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function usePmRecords(assetId: string) {
  return useQuery({ queryKey: ["pm-records", assetId], queryFn: () => listPmRecords(assetId) });
}
