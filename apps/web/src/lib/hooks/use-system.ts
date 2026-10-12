"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { getSystem, sendTestAlert } from "@/lib/api/system";

/** Settings → System; refreshed every minute while open. */
export function useSystem() {
  return useQuery({ queryKey: ["admin-system"], queryFn: getSystem, refetchInterval: 60_000 });
}

export function useTestAlert() {
  return useMutation({ mutationFn: sendTestAlert });
}
