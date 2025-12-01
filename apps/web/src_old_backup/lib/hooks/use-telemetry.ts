"use client";

import { useQuery } from "@tanstack/react-query";

import type { AssetLocationPing, TelemetryIngestEvent } from "@medasset/types";
import {
  getLatestMockPing,
  getMockAssetLocationPings,
  getMockMaintenanceTasks,
  getMockTelemetryIngestEvents,
  listMockTelemetryAssets,
} from "@medasset/utils/telemetry-mock";

interface TelemetrySnapshot {
  assetId: string;
  assetKey: string;
  status: string;
  latest: AssetLocationPing;
  trail: AssetLocationPing[];
}

export function useTelemetrySnapshot() {
  return useQuery({
    queryKey: ["telemetry", "snapshot"],
    queryFn: () => {
      const seeds = listMockTelemetryAssets();

      return seeds.map<TelemetrySnapshot>((seed) => ({
        assetId: seed.assetId,
        assetKey: seed.assetKey,
        status: seed.status,
        latest: getLatestMockPing(seed.assetId),
        trail: getMockAssetLocationPings(seed.assetId, 8),
      }));
    },
    refetchInterval: 15_000,
  });
}

export function useMaintenanceTasks() {
  return useQuery({
    queryKey: ["maintenance", "tasks"],
    queryFn: () => getMockMaintenanceTasks(),
    refetchInterval: 30_000,
  });
}

export function useTelemetryIngestEvents() {
  return useQuery<TelemetryIngestEvent[]>({
    queryKey: ["telemetry", "ingest-events"],
    queryFn: () => getMockTelemetryIngestEvents(),
    refetchInterval: 20_000,
  });
}

