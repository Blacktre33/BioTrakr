"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  correctCalibration,
  listCalibrations,
  recordCalibration,
  type CalibrationInput,
} from "@/lib/api/calibration";

export function useCalibrations(assetId: string) {
  return useQuery({ queryKey: ["calibrations", assetId], queryFn: () => listCalibrations(assetId) });
}

/** A calibration can change the device's dates, status and the dashboard. */
function useInvalidateCalibrationViews() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["calibrations"] });
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
    void queryClient.invalidateQueries({ queryKey: ["asset-lookup"] });
    void queryClient.invalidateQueries({ queryKey: ["asset-status-history"] });
    void queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  };
}

export function useRecordCalibration(assetId: string) {
  const invalidate = useInvalidateCalibrationViews();
  return useMutation({
    mutationFn: (body: CalibrationInput) => recordCalibration(assetId, body),
    onSettled: invalidate,
  });
}

export function useCorrectCalibration() {
  const invalidate = useInvalidateCalibrationViews();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CalibrationInput & { correctionReason: string } }) =>
      correctCalibration(id, body),
    onSettled: invalidate,
  });
}
