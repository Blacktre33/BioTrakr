"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listDocuments,
  uploadDocument,
  withdrawDocument,
  type DocumentCategory,
  type DocumentTarget,
} from "@/lib/api/documents";

export function useDocuments(targetType: DocumentTarget, targetId: string, enabled = true) {
  return useQuery({
    queryKey: ["documents", targetType, targetId],
    queryFn: () => listDocuments(targetType, targetId),
    enabled,
  });
}

/** A file changes the record's file count and the device's document list too. */
function useInvalidateDocumentViews() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
    void queryClient.invalidateQueries({ queryKey: ["calibrations"] });
    void queryClient.invalidateQueries({ queryKey: ["safety-tests"] });
    void queryClient.invalidateQueries({ queryKey: ["contracts"] });
    void queryClient.invalidateQueries({ queryKey: ["condemnation"] });
    void queryClient.invalidateQueries({ queryKey: ["training"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  };
}

export function useUploadDocument() {
  const invalidate = useInvalidateDocumentViews();
  return useMutation({
    mutationFn: (body: {
      targetType: DocumentTarget;
      targetId: string;
      file: File;
      title?: string;
      category?: DocumentCategory;
    }) => uploadDocument(body),
    onSettled: invalidate,
  });
}

export function useWithdrawDocument() {
  const invalidate = useInvalidateDocumentViews();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => withdrawDocument(id, reason),
    onSettled: invalidate,
  });
}
