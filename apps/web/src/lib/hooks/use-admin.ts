"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createLocation,
  createStaff,
  getLocations,
  getStaff,
  resetStaffPassword,
  updateLocation,
  updateStaff,
  type LocationKind,
  type NewStaff,
} from "@/lib/api/admin";

export function useLocations() {
  return useQuery({ queryKey: ["admin-locations"], queryFn: getLocations });
}

export function useStaff() {
  return useQuery({ queryKey: ["admin-users"], queryFn: getStaff });
}

/** Saving a location also changes the pickers in the asset form. */
export function useSaveLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: LocationKind; id?: string; body: Record<string, unknown> }) =>
      input.id ? updateLocation(input.kind, input.id, input.body) : createLocation(input.kind, input.body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-locations"] });
      void queryClient.invalidateQueries({ queryKey: ["reference"] });
    },
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NewStaff) => createStaff(body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["reference"] });
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateStaff>[1] }) => updateStaff(id, body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["reference"] });
    },
  });
}

export function useResetStaffPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resetStaffPassword(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}
