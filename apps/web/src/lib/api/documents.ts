import { api } from "./client";

export type DocumentTarget = "asset" | "calibration" | "safetyTest" | "contract" | "workOrder";
export type DocumentCategory =
  | "CALIBRATION_CERTIFICATE"
  | "SAFETY_TEST_REPORT"
  | "SERVICE_REPORT"
  | "CONTRACT"
  | "INSTALLATION_REPORT"
  | "MANUAL"
  | "INVOICE"
  | "OTHER";

export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  CALIBRATION_CERTIFICATE: "Calibration certificate",
  SAFETY_TEST_REPORT: "Safety test report",
  SERVICE_REPORT: "Service report",
  CONTRACT: "Contract",
  INSTALLATION_REPORT: "Installation or acceptance report",
  MANUAL: "Manual",
  INVOICE: "Invoice or purchase order",
  OTHER: "Other",
};

/** Must match the API (documents/file-type.ts). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export interface StoredDocument {
  id: string;
  assetId: string | null;
  calibrationRecordId: string | null;
  safetyTestRecordId: string | null;
  contractId: string | null;
  workOrderId: string | null;
  category: DocumentCategory;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Hex SHA-256 of the file as uploaded. */
  sha256: string;
  uploadedAt: string;
  uploadedBy: string;
  withdrawal: { reason: string; withdrawnAt: string; withdrawnBy: string } | null;
}

/** "1.4 MB", "820 KB". */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Why a file would be refused, before it is sent; null when fine. */
export function fileProblem(file: File): string | null {
  if (file.size === 0) return "The file is empty";
  if (file.size > MAX_DOCUMENT_BYTES) return "The file is larger than 10 MB";
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name) && !/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) {
    return "Upload a PDF, JPEG or PNG file";
  }
  return null;
}

export async function listDocuments(targetType: DocumentTarget, targetId: string): Promise<StoredDocument[]> {
  const { data } = await api.get<StoredDocument[]>("/documents", { params: { targetType, targetId } });
  return data;
}

export async function uploadDocument(body: {
  targetType: DocumentTarget;
  targetId: string;
  file: File;
  title?: string;
  category?: DocumentCategory;
}): Promise<StoredDocument> {
  const form = new FormData();
  form.append("targetType", body.targetType);
  form.append("targetId", body.targetId);
  if (body.title?.trim()) form.append("title", body.title.trim());
  if (body.category) form.append("category", body.category);
  form.append("file", body.file);
  const { data } = await api.post<StoredDocument>("/documents", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function withdrawDocument(id: string, reason: string): Promise<StoredDocument> {
  const { data } = await api.post<StoredDocument>(`/documents/${id}/withdrawal`, { reason });
  return data;
}

/**
 * Opens a file in a new tab. It is fetched with the signed-in user's token
 * (a plain link would not carry it), then shown from memory. If the
 * browser blocks the tab, the file downloads instead.
 */
export async function openDocument(doc: Pick<StoredDocument, "id" | "fileName" | "mimeType">): Promise<void> {
  // Opened now, while the click still counts, then pointed at the file.
  const tab = window.open("", "_blank");
  try {
    const { data } = await api.get<Blob>(`/documents/${doc.id}/file`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], { type: doc.mimeType }));
    if (tab) {
      tab.location.href = url;
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName;
      a.click();
    }
    // Long enough for the tab to load it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
