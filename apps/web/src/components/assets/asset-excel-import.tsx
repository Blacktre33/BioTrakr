'use client';

import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui';
import { downloadAssetTemplate, validateExcelFile, type ImportCheck, type ImportError, type ImportResult } from '@/lib/api/assets';
import { useImportAssetsMutation } from '@/lib/hooks/use-assets';
import { cn } from '@/lib/utils';

interface AssetExcelImportProps {
  onImportComplete?: (result: { imported: number; failed: number; totalRows: number }) => void;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'checking' }
  | { kind: 'checked'; check: ImportCheck }
  | { kind: 'importing'; check: ImportCheck }
  | { kind: 'done'; result: ImportResult }
  | { kind: 'failed'; message: string };

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const devices = (n: number) => `${n} ${n === 1 ? 'device' : 'devices'}`;

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** The problems as a CSV the person can open next to their sheet. */
function errorsCsv(errors: ImportError[]): Blob {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Row', 'Column', 'Problem', 'Value'].map(cell).join(','),
    ...errors.map((e) => [e.row || 'File', e.field, e.message, e.value].map(cell).join(',')),
  ];
  return new Blob([lines.join('\r\n')], { type: 'text/csv' });
}

function ProblemList({ errors }: { errors: ImportError[] }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Problems to fix in the file</caption>
        <thead className="sticky top-0 bg-surface-800 text-xs uppercase text-gray-400">
          <tr>
            <th scope="col" className="px-3 py-2">Row</th>
            <th scope="col" className="px-3 py-2">Column</th>
            <th scope="col" className="px-3 py-2">Problem</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e, i) => (
            <tr key={i} className="border-t border-white/5 align-top">
              <td className="px-3 py-2 text-gray-300">{e.row || 'File'}</td>
              <td className="px-3 py-2 text-gray-300">{e.field}</td>
              <td className="px-3 py-2 text-red-300">
                {e.message}
                {e.value !== undefined && e.value !== null && e.value !== '' && (
                  <span className="block text-xs text-gray-400">You entered: {String(e.value)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Bulk import, check first: choosing a file checks every row straight away
 * and shows the problems by row and column. Import is only offered when
 * the whole file is valid, and saves all rows or none.
 */
export function AssetExcelImport({ onImportComplete }: AssetExcelImportProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [fileError, setFileError] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportAssetsMutation();

  const reset = () => {
    setFile(null);
    setStep({ kind: 'pick' });
    setFileError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const check = async (selected: File) => {
    setStep({ kind: 'checking' });
    try {
      setStep({ kind: 'checked', check: await validateExcelFile(selected) });
    } catch (error) {
      setStep({ kind: 'failed', message: (error as Error).message || 'Could not check the file. Please try again.' });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setFileError(undefined);
    if (!selected.name.toLowerCase().endsWith('.xlsx')) {
      setFileError('Please choose an Excel file (.xlsx). In Excel, use File → Save As → Excel Workbook.');
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFileError('This file is larger than 5 MB. Split it into smaller files.');
      return;
    }
    setFile(selected);
    void check(selected);
  };

  const handleDownloadTemplate = async () => {
    try {
      saveBlob(await downloadAssetTemplate(), 'biotrakr_asset_template.xlsx');
    } catch {
      setFileError('Could not download the template. Please try again.');
    }
  };

  const handleImport = async () => {
    if (!file || step.kind !== 'checked') return;
    setStep({ kind: 'importing', check: step.check });
    try {
      const result = await importMutation.mutateAsync(file);
      setStep({ kind: 'done', result });
      if (result.success) {
        onImportComplete?.({ imported: result.imported, failed: result.failed, totalRows: result.totalRows });
      }
    } catch (error) {
      setStep({ kind: 'failed', message: (error as Error).message || 'Import failed. Nothing was saved.' });
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setTimeout(reset, 200);
  };

  const checked = step.kind === 'checked' || step.kind === 'importing' ? step.check : null;
  const errors = checked?.errors ?? (step.kind === 'done' ? step.result.errors : []);
  const warnings = checked?.warnings ?? (step.kind === 'done' ? step.result.warnings : []);
  const fileLevelWarnings = warnings.filter((w) => w.row === 0);
  const rowWarnings = warnings.filter((w) => w.row > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" leftIcon={<Upload className="w-4 h-4" />}>
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-surface-900 border-surface-700">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Import devices from Excel</DialogTitle>
          <DialogDescription className="text-gray-400">
            We check every row first. Nothing is saved until the whole file is correct, and then all rows are saved together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg bg-surface-800 border border-surface-700">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-primary-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-white">Start from the template</p>
                <p className="text-xs text-gray-400">It lists the columns and the allowed values for each list.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={handleDownloadTemplate}>
              Download template
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileSelect}
              className="sr-only"
              id="excel-file-input"
            />
            <label htmlFor="excel-file-input" className="flex-1 cursor-pointer">
              <div className="flex items-center justify-center gap-3 p-6 border-2 border-dashed border-surface-600 rounded-lg hover:border-primary-500 transition-colors bg-surface-800/50">
                <Upload className="w-6 h-6 text-gray-400" aria-hidden="true" />
                <div className="text-center">
                  <p className="text-sm font-medium text-white">{file ? file.name : 'Choose an Excel file (.xlsx)'}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {file ? `${(file.size / 1024).toFixed(0)} KB · choose again to replace` : 'Up to 5 MB and 2,000 rows'}
                  </p>
                </div>
              </div>
            </label>
            {file && (
              <Button variant="ghost" size="sm" onClick={reset} aria-label="Remove file">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {fileError && (
            <p role="alert" className="text-sm text-red-300">
              {fileError}
            </p>
          )}

          {step.kind === 'checking' && (
            <p className="text-sm text-gray-300" aria-live="polite">
              Checking every row…
            </p>
          )}

          {step.kind === 'failed' && (
            <div role="alert" className="flex gap-3 p-4 rounded-lg border bg-red-500/10 border-red-500/20">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-red-200">{step.message} Nothing was saved.</p>
            </div>
          )}

          {checked && (
            <div
              role="status"
              className={cn(
                'p-4 rounded-lg border space-y-1',
                checked.valid ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20',
              )}
            >
              {checked.valid ? (
                <>
                  <p className="flex items-center gap-2 font-medium text-green-300">
                    <CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Ready to import {devices(checked.toCreate + checked.toUpdate)}
                  </p>
                  <p className="text-sm text-gray-300">
                    {checked.toCreate} new, {checked.toUpdate} {checked.toUpdate === 1 ? 'update' : 'updates'} to devices already in BioTrakr.
                  </p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 font-medium text-red-300">
                    <AlertCircle className="w-5 h-5" aria-hidden="true" />
                    {errors.length === 1 ? '1 problem to fix' : `${errors.length} problems to fix`} before importing
                  </p>
                  <p className="text-sm text-gray-300">Fix them in your spreadsheet, save it, and choose the file again.</p>
                </>
              )}
            </div>
          )}

          {step.kind === 'done' && (
            <div
              role="status"
              className={cn(
                'p-4 rounded-lg border',
                step.result.success ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20',
              )}
            >
              {step.result.success ? (
                <p className="flex items-center gap-2 font-medium text-green-300">
                  <CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Imported {devices(step.result.imported)} ({step.result.created} new,{' '}
                  {step.result.updated} updated).
                </p>
              ) : (
                <p className="flex items-center gap-2 font-medium text-red-300">
                  <AlertCircle className="w-5 h-5" aria-hidden="true" /> Nothing was imported. Fix the problems below and try again.
                </p>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">Problems</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Download className="w-4 h-4" />}
                  onClick={() => saveBlob(errorsCsv(errors), 'import-problems.csv')}
                >
                  Download list
                </Button>
              </div>
              <ProblemList errors={errors} />
            </div>
          )}

          {fileLevelWarnings.map((w) => (
            <p key={w.message} className="text-sm text-amber-300">
              {w.message}
            </p>
          ))}

          {rowWarnings.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-amber-300">
                {rowWarnings.length === 1 ? '1 note' : `${rowWarnings.length} notes`} (these rows will still import)
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 text-gray-300">
                {rowWarnings.map((w, i) => (
                  <li key={i}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {checked?.valid && checked.preview.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-white">
                Preview{checked.preview.length < checked.totalRows ? ` (first ${checked.preview.length} of ${checked.totalRows})` : ''}
              </h3>
              <div className="max-h-64 overflow-auto rounded-lg border border-white/10">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Devices that will be imported</caption>
                  <thead className="sticky top-0 bg-surface-800 text-xs uppercase text-gray-400">
                    <tr>
                      <th scope="col" className="px-3 py-2">Row</th>
                      <th scope="col" className="px-3 py-2">Tag</th>
                      <th scope="col" className="px-3 py-2">Device</th>
                      <th scope="col" className="px-3 py-2">Where</th>
                      <th scope="col" className="px-3 py-2">Status</th>
                      <th scope="col" className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checked.preview.map((p) => (
                      <tr key={p.row} className="border-t border-white/5">
                        <td className="px-3 py-2 text-gray-400">{p.row}</td>
                        <td className="px-3 py-2 font-mono text-gray-200">{p.assetTagNumber}</td>
                        <td className="px-3 py-2 text-gray-200">{p.equipmentName}</td>
                        <td className="px-3 py-2 text-gray-300">
                          {p.department}, {p.facility}
                        </td>
                        <td className="px-3 py-2 text-gray-300">{p.status}</td>
                        <td className="px-3 py-2 text-gray-300">{p.action === 'create' ? 'New' : 'Update'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={step.kind === 'importing'}>
            {step.kind === 'done' ? 'Close' : 'Cancel'}
          </Button>
          {step.kind !== 'done' && (
            <Button
              onClick={handleImport}
              disabled={!checked?.valid || step.kind === 'importing'}
              leftIcon={step.kind === 'importing' ? undefined : <Upload className="w-4 h-4" />}
            >
              {step.kind === 'importing'
                ? 'Importing…'
                : checked?.valid
                  ? `Import ${devices(checked.toCreate + checked.toUpdate)}`
                  : 'Import'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
