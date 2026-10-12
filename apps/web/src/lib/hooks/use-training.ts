"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listTraining, saveTraining, type TrainingInput } from "@/lib/api/training";

/** Every session, or those that covered one device. */
export function useTraining(assetId?: string) {
  return useQuery({ queryKey: ["training", assetId ?? null], queryFn: () => listTraining(assetId) });
}

export function useSaveTraining() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: TrainingInput }) => saveTraining(body, id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["training"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
