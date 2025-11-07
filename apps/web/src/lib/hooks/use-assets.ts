"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import type { AssetStatus, AssetSummary } from "@medasset/types";

// Leverage the shared types package so UI mocks stay aligned with backend
// contracts, preventing drift when the API schema evolves.
const MOCK_ASSETS: AssetSummary[] = [
  {
    id: "asset-1",
    name: "Infusion Pump - Alaris",
    assetTag: "IP-001",
    status: "available",
    category: "Infusion Pump",
    facility: "Main Campus",
    lastSeen: "ED - 2nd Floor",
  },
  {
    id: "asset-2",
    name: "Patient Monitor - Philips MX800",
    assetTag: "PM-014",
    status: "in_use",
    category: "Monitor",
    facility: "ICU",
    lastSeen: "ICU Room 302",
  },
  {
    id: "asset-3",
    name: "Ventilator - Puritan Bennett 980",
    assetTag: "VENT-008",
    status: "maintenance",
    category: "Ventilator",
    facility: "Respiratory Care",
    lastSeen: "Biomedical Lab",
  },
  {
    id: "asset-4",
    name: "Ultrasound - GE Logiq E10",
    assetTag: "US-021",
    status: "available",
    category: "Ultrasound",
    facility: "Women's Health",
    lastSeen: "Clinic 4B",
  },
  {
    id: "asset-5",
    name: "Wheelchair - Stryker Prime",
    assetTag: "WC-105",
    status: "in_use",
    category: "Mobility",
    facility: "Rehab Center",
    lastSeen: "Room 110",
  },
];

async function fetchAssets(search?: string, statusFilter?: AssetStatus) {
  await new Promise((resolve) => setTimeout(resolve, 350));

  return MOCK_ASSETS.filter((asset) => {
    const matchesSearch = search
      ? asset.name.toLowerCase().includes(search.toLowerCase()) ||
        asset.assetTag.toLowerCase().includes(search.toLowerCase())
      : true;

    const matchesStatus = statusFilter ? asset.status === statusFilter : true;

    return matchesSearch && matchesStatus;
  });
}

export function useAssets(
  search: string,
  status?: AssetStatus,
  options?: Pick<UseQueryOptions<AssetSummary[]>, "enabled">
) {
  return useQuery({
    queryKey: ["assets", { search, status }],
    queryFn: () => fetchAssets(search, status),
    ...options,
  });
}
