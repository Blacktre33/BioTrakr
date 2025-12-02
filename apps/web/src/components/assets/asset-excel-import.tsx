'use client';

import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download, X } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui';
import { downloadAssetTemplate, validateExcelFile } from '@/lib/api/assets';
import { useImportAssetsMutation } from '@/lib/hooks/use-assets';
import { cn } from '@/lib/utils';

interface AssetExcelImportProps {
  onImportComplete?: (result: { imported: number; failed: number; totalRows: number }) => void;
}

export function AssetExcelImport({ onImportComplete }: AssetExcelImportProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    totalRows: number;
    imported: number;
    failed: number;
    errors: Array<{ row: number; field: string; message: string }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use mutation hook for importing
  const importMutation = useImportAssetsMutation();
  
  // Combined loading state for both validation and import
  const isLoading = isValidating || importMutation.isPending;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ];
      
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.xlsx')) {
        alert('Please select a valid Excel file (.xlsx)');
        return;
      }

      setFile(selectedFile);
      setImportResult(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadAssetTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'biotrakr_asset_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download template:', error);
      alert('Failed to download template. Please try again.');
    }
  };

  const handleValidate = async () => {
    if (!file) return;

    try {
      setIsValidating(true);
      const result = await validateExcelFile(file);
      setImportResult({
        success: result.errors.length === 0,
        totalRows: result.totalRows,
        imported: result.imported || 0,
        failed: result.failed || 0,
        errors: result.errors || [],
      });
    } catch (error: any) {
      console.error('Validation error:', error);
      setImportResult({
        success: false,
        totalRows: 0,
        imported: 0,
        failed: 1,
        errors: [{ row: 0, field: 'file', message: error.response?.data?.message || 'Validation failed' }],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    try {
      const result = await importMutation.mutateAsync(file);
      setImportResult({
        success: result.success,
        totalRows: result.totalRows,
        imported: result.imported,
        failed: result.failed,
        errors: result.errors || [],
      });

      if (result.success && onImportComplete) {
        onImportComplete({
          imported: result.imported,
          failed: result.failed,
          totalRows: result.totalRows,
        });
      }
    } catch (error: any) {
      console.error('Import error:', error);
      setImportResult({
        success: false,
        totalRows: 0,
        imported: 0,
        failed: 1,
        errors: [{ row: 0, field: 'file', message: error.response?.data?.message || error.message || 'Import failed' }],
      });
    }
  };

  const handleReset = () => {
    setFile(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    setOpen(false);
    // Reset after a short delay to allow dialog close animation
    setTimeout(() => {
      handleReset();
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" leftIcon={<Upload className="w-4 h-4" />}>
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-surface-900 border-surface-700">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Import Assets from Excel</DialogTitle>
          <DialogDescription className="text-gray-400">
            Upload an Excel file (.xlsx) to import multiple assets at once. Download the template to see the required format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Template Download */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-surface-800 border border-surface-700">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-primary-400" />
              <div>
                <p className="text-sm font-medium text-white">Need a template?</p>
                <p className="text-xs text-gray-400">Download the Excel template with all required columns</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleDownloadTemplate}
            >
              Download Template
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-white">Select Excel File</label>
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileSelect}
                className="hidden"
                id="excel-file-input"
              />
              <label
                htmlFor="excel-file-input"
                className="flex-1 cursor-pointer"
              >
                <div className="flex items-center justify-center gap-3 p-6 border-2 border-dashed border-surface-600 rounded-lg hover:border-primary-500 transition-colors bg-surface-800/50">
                  <Upload className="w-6 h-6 text-gray-400" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">
                      {file ? file.name : 'Click to select Excel file'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {file ? `${(file.size / 1024).toFixed(2)} KB` : 'Supports .xlsx files only'}
                    </p>
                  </div>
                </div>
              </label>
              {file && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Import Results */}
          {importResult && (
            <div className={cn(
              "p-4 rounded-lg border",
              importResult.success
                ? "bg-green-500/10 border-green-500/20"
                : "bg-red-500/10 border-red-500/20"
            )}>
              <div className="flex items-start gap-3">
                {importResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                )}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className={cn(
                      "text-sm font-medium",
                      importResult.success ? "text-green-400" : "text-red-400"
                    )}>
                      {importResult.success ? 'Import Successful' : 'Import Completed with Errors'}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-gray-400">Total Rows</p>
                      <p className="text-white font-medium">{importResult.totalRows}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Imported</p>
                      <p className="text-green-400 font-medium">{importResult.imported}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Failed</p>
                      <p className="text-red-400 font-medium">{importResult.failed}</p>
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="mt-3 max-h-40 overflow-y-auto">
                      <p className="text-xs font-medium text-gray-400 mb-2">Errors:</p>
                      <div className="space-y-1">
                        {importResult.errors.slice(0, 10).map((error, idx) => (
                          <p key={idx} className="text-xs text-red-300">
                            Row {error.row}: {error.field} - {error.message}
                          </p>
                        ))}
                        {importResult.errors.length > 10 && (
                          <p className="text-xs text-gray-400">
                            ... and {importResult.errors.length - 10} more errors
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            {importResult ? 'Close' : 'Cancel'}
          </Button>
          <div className="flex items-center gap-2">
            {file && !importResult && (
              <Button
                variant="outline"
                onClick={handleValidate}
                disabled={isLoading}
              >
                {isValidating ? 'Validating...' : 'Validate'}
              </Button>
            )}
            <Button
              onClick={handleImport}
              disabled={!file || isLoading}
              leftIcon={importMutation.isPending ? undefined : <Upload className="w-4 h-4" />}
            >
              {importMutation.isPending ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

