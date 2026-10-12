"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  decideCondemnation,
  disposeCondemnation,
  getCondemnationFile,
  proposeCondemnation,
  withdrawCondemnation,
  type DecideInput,
  type DisposeInput,
  type ProposeInput,
} from "@/lib/api/condemnation";

export function useCondemnationFile(assetId: string, enabled = true) {
  return useQuery({
    queryKey: ["condemnation", assetId],
    queryFn: () => getCondemnationFile(assetId),
    enabled,
  });
}

type Step =
  | { kind: "propose"; body: ProposeInput }
  | { kind: "decide"; id: string; body: DecideInput }
  | { kind: "withdraw"; id: string; reason: string }
  | { kind: "dispose"; id: string; body: DisposeInput };

/** Every step of a condemnation; approval and disposal change the device's status too. */
export function useCondemnationStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (step: Step) => {
      switch (step.kind) {
        case "propose":
          return proposeCondemnation(step.body);
        case "decide":
          return decideCondemnation(step.id, step.body);
        case "withdraw":
          return withdrawCondemnation(step.id, step.reason);
        case "dispose":
          return disposeCondemnation(step.id, step.body);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["condemnation"] });
      void queryClient.invalidateQueries({ queryKey: ["asset-lookup"] });
      void queryClient.invalidateQueries({ queryKey: ["asset-status-history"] });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      void queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
