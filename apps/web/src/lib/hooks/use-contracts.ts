"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createContract,
  createVendor,
  getContract,
  getDeviceCover,
  listContracts,
  listVendors,
  renewContract,
  terminateContract,
  updateContract,
  updateVendor,
  type ContractFilter,
  type ContractInput,
  type VendorInput,
} from "@/lib/api/contracts";

export function useContracts(status: ContractFilter) {
  return useQuery({ queryKey: ["contracts", "list", status], queryFn: () => listContracts({ status }) });
}

export function useContract(id: string | null) {
  return useQuery({ queryKey: ["contracts", "one", id], queryFn: () => getContract(id!), enabled: Boolean(id) });
}

export function useDeviceCover(assetId: string) {
  return useQuery({ queryKey: ["contracts", "cover", assetId], queryFn: () => getDeviceCover(assetId) });
}

export function useVendors(enabled = true) {
  return useQuery({ queryKey: ["vendors"], queryFn: listVendors, enabled });
}

/** A contract change shows on the contract lists, device pages and the dashboard. */
function useInvalidateContractViews() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["contracts"] });
    void queryClient.invalidateQueries({ queryKey: ["vendors"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

/** Add, change or renew: `mode` decides which. */
export function useSaveContract() {
  const invalidate = useInvalidateContractViews();
  return useMutation({
    mutationFn: ({ mode, id, body }: { mode: "create" | "edit" | "renew"; id?: string; body: ContractInput }) =>
      mode === "create" ? createContract(body) : mode === "edit" ? updateContract(id!, body) : renewContract(id!, body),
    onSettled: invalidate,
  });
}

export function useTerminateContract() {
  const invalidate = useInvalidateContractViews();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => terminateContract(id, reason),
    onSettled: invalidate,
  });
}

export function useSaveVendor() {
  const invalidate = useInvalidateContractViews();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: VendorInput }) => (id ? updateVendor(id, body) : createVendor(body)),
    onSettled: invalidate,
  });
}
