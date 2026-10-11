"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  correctSafetyTest,
  listSafetyTests,
  recordSafetyTest,
  type SafetyTestInput,
} from "@/lib/api/safety-tests";

export function useSafetyTests(assetId: string) {
  return useQuery({ queryKey: ["safety-tests", assetId], queryFn: () => listSafetyTests(assetId) });
}

/** A test can change the device's dates, status and the dashboard. */
function useInvalidateSafetyTestViews() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["safety-tests"] });
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
    void queryClient.invalidateQueries({ queryKey: ["asset-lookup"] });
    void queryClient.invalidateQueries({ queryKey: ["asset-status-history"] });
    void queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useRecordSafetyTest(assetId: string) {
  const invalidate = useInvalidateSafetyTestViews();
  return useMutation({
    mutationFn: (body: SafetyTestInput) => recordSafetyTest(assetId, body),
    onSettled: invalidate,
  });
}

export function useCorrectSafetyTest() {
  const invalidate = useInvalidateSafetyTestViews();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SafetyTestInput & { correctionReason: string } }) =>
      correctSafetyTest(id, body),
    onSettled: invalidate,
  });
}
