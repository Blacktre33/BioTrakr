"use client";

import { FolderOpen } from "lucide-react";

import { Attachments } from "./attachments";

/**
 * Every file about a device in one place: its own documents (manuals,
 * installation reports, invoices) and the certificates and reports kept
 * with its records.
 */
export function DocumentsSection({ assetId, canUpload }: { assetId: string; canUpload: boolean }) {
  return (
    <section aria-labelledby="documents-heading" className="rounded-2xl border border-white/10 p-4">
      <h2 id="documents-heading" className="flex items-center gap-2 font-medium text-gray-200">
        <FolderOpen className="h-4 w-4" aria-hidden="true" /> Documents
      </h2>
      <p className="mt-1 text-sm text-gray-400">
        Certificates, test reports and service reports appear here too. Files are never deleted: a wrong one is
        withdrawn and stays on record.
      </p>
      <Attachments
        targetType="asset"
        targetId={assetId}
        canUpload={canUpload}
        alwaysOpen
        showCategory
        label={{ one: "Document", none: "No documents yet" }}
      />
    </section>
  );
}
