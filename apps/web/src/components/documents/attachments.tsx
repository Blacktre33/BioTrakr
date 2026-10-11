"use client";

import { useId, useRef, useState } from "react";
import { Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";

import { SELECT_CLASS } from "@/components/forms/form-field";
import { Button, Input, Label, Skeleton, Textarea } from "@/components/ui";
import {
  ACCEPTED_TYPES,
  CATEGORY_LABEL,
  fileProblem,
  formatSize,
  openDocument,
  type DocumentCategory,
  type DocumentTarget,
  type StoredDocument,
} from "@/lib/api/documents";
import { useDocuments, useUploadDocument, useWithdrawDocument } from "@/lib/hooks/use-documents";
import { cn, formatDate } from "@/lib/utils";

function DocumentItem({
  doc,
  canWithdraw,
  showCategory,
}: {
  doc: StoredDocument;
  canWithdraw: boolean;
  showCategory: boolean;
}) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const withdraw = useWithdrawDocument();
  const reasonId = useId();

  const open = async () => {
    try {
      await openDocument(doc);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't open the file");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (reason.trim().length < 5) {
      setError("Say why the file is withdrawn");
      return;
    }
    try {
      await withdraw.mutateAsync({ id: doc.id, reason: reason.trim() });
      toast.success("File withdrawn; it stays on record, marked");
      setWithdrawing(false);
    } catch (err) {
      setError((err as Error).message || "Could not save. Please try again.");
    }
  };

  return (
    <li className={cn("text-sm", doc.withdrawal && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" onClick={open} className="text-left text-primary-400 hover:underline">
          {doc.title}
        </button>
        <span className="text-xs text-gray-500">
          {showCategory ? `${CATEGORY_LABEL[doc.category]} · ` : ""}
          {doc.fileName} · {formatSize(doc.sizeBytes)} · {formatDate(doc.uploadedAt)} by {doc.uploadedBy}
        </span>
        {canWithdraw && !doc.withdrawal && !withdrawing && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setWithdrawing(true)}>
            Withdraw…
          </Button>
        )}
      </div>
      {doc.withdrawal && (
        <p className="text-xs text-warning-500">
          Withdrawn {formatDate(doc.withdrawal.withdrawnAt)} by {doc.withdrawal.withdrawnBy}: {doc.withdrawal.reason}
        </p>
      )}
      {withdrawing && (
        <form onSubmit={submit} noValidate className="mt-2 space-y-2 rounded-lg bg-surface-200/30 p-2">
          <Label htmlFor={reasonId}>Why withdraw it? It stays on record, marked as withdrawn.</Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Certificate for a different pump"
            aria-invalid={error ? true : undefined}
          />
          {error && (
            <p role="alert" className="text-xs text-critical-500">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="danger" disabled={withdraw.isPending}>
              {withdraw.isPending ? "Saving…" : "Withdraw file"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setWithdrawing(false)}>
              Back
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

function UploadForm({
  targetType,
  targetId,
  showCategory,
  defaultTitle,
  onDone,
}: {
  targetType: DocumentTarget;
  targetId: string;
  showCategory: boolean;
  defaultTitle?: string;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("OTHER");
  const [error, setError] = useState<string>();
  const upload = useUploadDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = { file: useId(), title: useId(), category: useId() };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(undefined);
    if (!file) {
      setError("Choose a file to upload");
      inputRef.current?.focus();
      return;
    }
    const problem = fileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      await upload.mutateAsync({
        targetType,
        targetId,
        file,
        title: title || defaultTitle,
        category: showCategory ? category : undefined,
      });
      toast.success("File attached");
      onDone();
    } catch (err) {
      setError((err as Error).message || "Could not upload. Please try again.");
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-2 space-y-2 rounded-lg bg-surface-200/30 p-3">
      <div className="space-y-1">
        <Label htmlFor={ids.file}>File (PDF, JPEG or PNG, up to 10 MB)</Label>
        <input
          ref={inputRef}
          id={ids.file}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setError(f ? (fileProblem(f) ?? undefined) : undefined);
          }}
          className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-500/20 file:px-3 file:py-1.5 file:text-gray-100"
        />
      </div>
      <div className={cn("grid gap-2", showCategory && "sm:grid-cols-2")}>
        <div className="space-y-1">
          <Label htmlFor={ids.title}>Title (optional)</Label>
          <Input
            id={ids.title}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder={defaultTitle ?? "The file name is used if empty"}
          />
        </div>
        {showCategory && (
          <div className="space-y-1">
            <Label htmlFor={ids.category}>What is it?</Label>
            <select
              id={ids.category}
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              className={SELECT_CLASS}
            >
              {(["INSTALLATION_REPORT", "MANUAL", "INVOICE", "SERVICE_REPORT", "OTHER"] as const).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-critical-500">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" leftIcon={<Upload className="h-3.5 w-3.5" />} disabled={upload.isPending}>
          {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={upload.isPending}>
          Back
        </Button>
      </div>
    </form>
  );
}

/**
 * Files kept with a record: shows whether evidence is on file, opens it,
 * and lets biomed attach or withdraw. Collapsed until wanted, so a long list
 * of records does not load every file list at once.
 */
export function Attachments({
  targetType,
  targetId,
  count,
  canUpload,
  label = { one: "File", none: "No file attached" },
  defaultTitle,
  alwaysOpen = false,
  showCategory = false,
}: {
  targetType: DocumentTarget;
  targetId: string;
  /** Files on record (not withdrawn), when known. */
  count?: number;
  canUpload: boolean;
  /** e.g. { one: "Certificate", none: "No certificate on file" } */
  label?: { one: string; none: string };
  defaultTitle?: string;
  alwaysOpen?: boolean;
  showCategory?: boolean;
}) {
  const [open, setOpen] = useState(alwaysOpen);
  const [uploading, setUploading] = useState(false);
  const docs = useDocuments(targetType, targetId, open);
  const listId = useId();
  const known = count ?? docs.data?.filter((d) => !d.withdrawal).length;

  return (
    <div className="mt-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Paperclip className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
        {!alwaysOpen && known !== undefined && (
          <span className={cn(known ? "text-gray-300" : "text-gray-500")}>
            {known === 0 ? label.none : `${label.one} on file (${known})`}
          </span>
        )}
        {!alwaysOpen && (known === undefined || known > 0 || (docs.data?.length ?? 0) > 0) && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen(!open)}
            className="text-primary-400 hover:underline"
          >
            {/* Not counted yet: the toggle names what it shows. */}
            {known === undefined ? `${label.one}s` : open ? "Hide" : "Show"}
          </button>
        )}
        {canUpload && !uploading && (
          <button
            type="button"
            onClick={() => {
              setUploading(true);
              setOpen(true);
            }}
            className="text-primary-400 hover:underline"
          >
            Attach a file
          </button>
        )}
      </div>
      {uploading && (
        <UploadForm
          targetType={targetType}
          targetId={targetId}
          showCategory={showCategory}
          defaultTitle={defaultTitle}
          onDone={() => setUploading(false)}
        />
      )}
      {open && (
        <div id={listId}>
          {docs.isPending ? (
            <Skeleton className="mt-2 h-6 w-2/3" />
          ) : docs.isError ? (
            <p role="alert" className="mt-1 text-sm text-critical-500">
              Couldn&apos;t load files: {docs.error.message}
            </p>
          ) : docs.data.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {docs.data.map((d) => (
                <DocumentItem key={d.id} doc={d} canWithdraw={canUpload} showCategory={showCategory} />
              ))}
            </ul>
          ) : alwaysOpen ? (
            <p className="mt-1 text-sm text-gray-500">{label.none}.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
