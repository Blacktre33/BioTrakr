"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { listAudit } from "@/lib/api/audit";

/** A device's edit history, newest first: the latest `take` entries. */
export function useDeviceHistory(assetId: string, take: number) {
  return useQuery({
    queryKey: ["audit", "device", assetId, take],
    queryFn: () => listAudit({ assetId, take }),
    placeholderData: keepPreviousData,
  });
}
